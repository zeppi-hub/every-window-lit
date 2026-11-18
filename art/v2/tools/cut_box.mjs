// Takes something out of a packed scene GLB without rebuilding it:
//   node art/v2/tools/cut_box.mjs <in.glb> <out.glb> --box x0,y0,z0,x1,y1,z1 --materials a,b
// Every triangle of the named materials whose three corners lie inside the box (three.js world
// coordinates, metres, y up) goes; nothing else changes. Prints how many went from each mesh and how
// many triangles only touch the box (those stay, so the box should hold the whole thing).
// Textures already packed (KTX2) are kept byte for byte; geometry is Draco again with pack.mjs's settings.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, draco, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const args = process.argv.slice(2);
const [src, dst] = args;
const opt = (flag) => { const i = args.indexOf(flag); return i < 0 ? '' : args[i + 1] ?? ''; };
const box = opt('--box').split(',').map(Number);
const materials = new Set(opt('--materials').split(',').filter(Boolean));
if (!src || !dst || box.length !== 6 || box.some(Number.isNaN) || materials.size === 0)
  throw new Error('usage: cut_box.mjs <in.glb> <out.glb> --box x0,y0,z0,x1,y1,z1 --materials a,b');
const lo = box.slice(0, 3);
const hi = box.slice(3);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(src);
const mul = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const inside = (p) => p.every((v, k) => v >= lo[k] && v <= hi[k]);

for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (mesh == null) continue;
  const world = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    if (!materials.has(prim.getMaterial()?.getName() ?? '')) continue;
    const pos = prim.getAttribute('POSITION');
    const idx = prim.getIndices();
    const n = idx != null ? idx.getCount() : pos.getCount();
    const keep = [];
    let cut = 0;
    let touching = 0;
    for (let t = 0; t < n; t += 3) {
      const corners = [0, 1, 2].map((k) => (idx != null ? idx.getScalar(t + k) : t + k));
      const flags = corners.map((v) => inside(mul(world, pos.getElement(v, []))));
      if (flags.every(Boolean)) cut += 1;
      else {
        if (flags.some(Boolean)) touching += 1;
        keep.push(...corners);
      }
    }
    if (cut === 0) continue;
    const indices = doc.createAccessor().setType('SCALAR').setArray(pos.getCount() > 65535 ? Uint32Array.from(keep) : Uint16Array.from(keep));
    prim.setIndices(indices);
    compactPrimitive(prim);
    console.log(`${node.getName()} (${prim.getMaterial().getName()}): ${cut} of ${n / 3} triangles cut, ${touching} touching the box kept`);
  }
}

await doc.transform(prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }), draco({ method: 'edgebreaker', quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(dst, doc);
