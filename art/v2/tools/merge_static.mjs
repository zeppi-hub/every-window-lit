// Fewer draws for a packed scene GLB, with the look and the named nodes kept:
//   node art/v2/tools/merge_static.mjs <in.glb> <out.glb> <report.json> --keep a,b,c [--split facade]
// The nodes in --keep (the ones the game finds by name) stay exactly as they
// are, with everything under them; so do empties and nodes with children. The
// other mesh nodes under the scene root, or directly under a kept node, are
// static: they are baked into their parent's frame and joined.
// 1) Parts with the same material become one mesh.
// 2) Parts whose materials have no texture (plain colour, roughness, metal,
//    glow, opaque) become one mesh with one small palette material: each old
//    material is a cell of flat colour (base colour, roughness/metal and glow
//    images) and the part's UVs point at its cell's centre.
// A group of one part is left as it was. --split <word> keeps parts whose node
// name holds the word apart from the rest, and the joined mesh's name holds
// the word (the city's house fronts are found by rays that look for "facade").
// Textures already packed (KTX2) are kept byte for byte; geometry is Draco
// again with the settings pack.mjs uses.
import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, joinPrimitives, prune, transformPrimitive } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const args = process.argv.slice(2);
const [src, dst, reportPath] = args;
const opt = (flag) => { const i = args.indexOf(flag); return i < 0 ? '' : args[i + 1] ?? ''; };
const keep = new Set(opt('--keep').split(',').filter(Boolean));
const split = opt('--split');
if (!src || !dst || !reportPath) throw new Error('usage: merge_static.mjs <in.glb> <out.glb> <report.json> --keep a,b [--split word]');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(src);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const before = root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0);

const textured = (m) => [m.getBaseColorTexture(), m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture(), m.getEmissiveTexture()].some((t) => t != null);
const plain = (m) =>
  m != null && !textured(m) && m.getAlphaMode() === 'OPAQUE' && m.listExtensions().every((e) => e.extensionName === 'KHR_materials_emissive_strength' && e.getEmissiveStrength() === 1);

/** A deep copy of a primitive (its own accessors), so baking a transform cannot touch the original. */
function own(prim) {
  const copy = doc.createPrimitive().setMode(prim.getMode()).setMaterial(prim.getMaterial());
  for (const semantic of prim.listSemantics()) copy.setAttribute(semantic, prim.getAttribute(semantic).clone());
  const indices = prim.getIndices();
  if (indices != null) copy.setIndices(indices.clone());
  else {
    const n = prim.getAttribute('POSITION').getCount();
    copy.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({ length: n }, (_, i) => i)));
  }
  return copy;
}

function keepOnly(prim, semantics) {
  for (const s of prim.listSemantics()) if (!semantics.includes(s)) prim.setAttribute(s, null);
}

const linearToSrgb = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));

async function png(size, cells, colour) {
  const data = Buffer.alloc(size * size * 4);
  const cell = 8;
  const cols = size / cell;
  cells.forEach((m, k) => {
    const [r, g, b] = colour(m);
    const cx = (k % cols) * cell;
    const cy = Math.floor(k / cols) * cell;
    for (let y = cy; y < cy + cell; y += 1)
      for (let x = cx; x < cx + cell; x += 1) data.set([r, g, b, 255], (y * size + x) * 4);
  });
  return sharp(data, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

/** One material for every plain material in `mats`; returns it and each old material's UV. */
async function palette(mats, name) {
  const cols = Math.ceil(Math.sqrt(mats.length));
  let size = 8;
  while (size < cols * 8) size *= 2;
  const per = size / 8;
  const uv = new Map(mats.map((m, k) => [m, [((k % per) + 0.5) * 8 / size, (Math.floor(k / per) + 0.5) * 8 / size]]));
  const glow = mats.some((m) => m.getEmissiveFactor().some((v) => v > 0));
  const tex = async (label, colour) => doc.createTexture(`${name}_${label}`).setMimeType('image/png').setImage(await png(size, mats, colour));
  const material = doc.createMaterial(name)
    .setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(1).setDoubleSided(mats.some((m) => m.getDoubleSided()))
    .setBaseColorTexture(await tex('color', (m) => m.getBaseColorFactor().slice(0, 3).map(linearToSrgb)))
    .setMetallicRoughnessTexture(await tex('rough_metal', (m) => [255, Math.round(255 * m.getRoughnessFactor()), Math.round(255 * m.getMetallicFactor())]));
  if (glow) material.setEmissiveFactor([1, 1, 1]).setEmissiveTexture(await tex('glow', (m) => m.getEmissiveFactor().map(linearToSrgb)));
  for (const info of [material.getBaseColorTextureInfo(), material.getMetallicRoughnessTextureInfo(), material.getEmissiveTextureInfo()])
    info?.setMagFilter(9728).setMinFilter(9728).setWrapS(33071).setWrapT(33071);
  return { material, uv };
}

const report = { file: dst, keep: [...keep].sort(), containers: [] };

/** Joins the static mesh children of `parent` (the scene or a kept node). */
async function mergeUnder(parent, label, prefix) {
  const children = parent.listChildren();
  const statics = children.filter((n) => n.getMesh() != null && n.listChildren().length === 0 && !keep.has(n.getName()) && n.getSkin() == null && n.listExtensions().length === 0);
  const groups = new Map();
  for (const node of statics)
    for (const prim of node.getMesh().listPrimitives()) {
      const mat = prim.getMaterial();
      const side = split !== '' && node.getName().includes(split) ? split : '';
      const key = plain(mat) ? `palette${side}` : `${mat?.getName() ?? 'none'}${side}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ node, prim, mat });
    }
  const merged = new Set();
  const made = [];
  for (const [key, parts] of groups) {
    if (parts.length < 2) continue;
    const prims = parts.map(({ node, prim }) => { const p = own(prim); transformPrimitive(p, node.getMatrix()); return p; });
    let material = parts[0].mat;
    if (key.startsWith('palette')) {
      const mats = [...new Set(parts.map((p) => p.mat))];
      const pal = await palette(mats, `${prefix}palette${key.slice(7)}`);
      material = pal.material;
      prims.forEach((p, i) => {
        keepOnly(p, ['POSITION', 'NORMAL']);
        const [u, v] = pal.uv.get(parts[i].mat);
        const n = p.getAttribute('POSITION').getCount();
        const a = new Float32Array(n * 2);
        for (let k = 0; k < n; k += 1) { a[k * 2] = u; a[k * 2 + 1] = v; }
        p.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(a));
      });
    } else {
      const common = prims.map((p) => p.listSemantics()).reduce((a, b) => a.filter((s) => b.includes(s)));
      prims.forEach((p) => keepOnly(p, common));
    }
    for (const p of prims) p.setMaterial(material);
    const joined = joinPrimitives(prims);
    for (const p of prims) p.dispose();
    const wordFree = split === '' || key.endsWith(split) ? key : key.replaceAll(split, 'fcd');
    const name = `${prefix}merged_${wordFree}`;
    const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(joined));
    parent.addChild(node);
    made.push({ node: name, from: [...new Set(parts.map((p) => p.node.getName()))], materials: [...new Set(parts.map((p) => p.mat?.getName()))] });
    for (const p of parts) merged.add(p.node);
  }
  // A node goes only when every one of its parts went into a joined mesh.
  const gone = [];
  for (const node of statics) {
    const all = node.getMesh().listPrimitives().every((prim) => [...groups.values()].some((g) => g.length > 1 && g.some((p) => p.prim === prim)));
    if (all) { gone.push(node.getName()); parent.removeChild(node); node.dispose(); }
    else if (merged.has(node)) {
      // Some parts joined, the rest stay on the node.
      for (const prim of node.getMesh().listPrimitives()) if ([...groups.values()].some((g) => g.length > 1 && g.some((p) => p.prim === prim))) node.getMesh().removePrimitive(prim);
    }
  }
  if (made.length > 0) report.containers.push({ under: label, made, removed: gone });
}

await mergeUnder(scene, '(scene root)', '');
for (const node of root.listNodes()) if (keep.has(node.getName()) && node.listChildren().length > 0) await mergeUnder(node, node.getName(), `${node.getName()}_`);

await doc.transform(prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }), draco({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(dst, doc);
report.primitives = { before, after: root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0) };
report.bytes = { before: readFileSync(src).length, after: readFileSync(dst).length };
report.file = dst.replace(/^.*?public\//, 'public/');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.primitives), report.containers.map((c) => `${c.under}: ${c.made.map((m) => `${m.node} <- ${m.from.join('+')}`).join('; ')} | removed ${c.removed.join(',')}`).join('\n'));
