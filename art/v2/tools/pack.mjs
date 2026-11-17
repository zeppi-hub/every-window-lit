// Packs one scene GLB exported from Blender for Quest:
//   node art/v2/tools/pack.mjs <in.glb> <out.glb> [report.json]
// 1) Every texture becomes KTX2 through basisu (the encoder the repo already
//    uses, art/textures/encode_ktx2.sh), declared with KHR_texture_basisu:
//    normal maps as UASTC (linear, RDO, Zstandard), colour maps as ETC1S
//    (sRGB), roughness/metal/occlusion maps as ETC1S (linear). Mipmaps on.
// 2) Geometry is Draco-compressed (KHR_draco_mesh_compression; IWSDK's glTF
//    loader decodes it). Node transforms stay exactly what the Blender scene had.
// 3) Duplicate textures, materials and accessors are merged; unused data goes.
// The size each texture ends at is chosen in the Blender build script.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, draco, prune, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const [, , src, dst, reportPath] = process.argv;
if (!src || !dst) throw new Error('usage: pack.mjs <in.glb> <out.glb> [report.json]');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(src);
const root = doc.getRoot();

// Which slot each texture fills decides how it is encoded.
const kind = new Map();
for (const m of root.listMaterials()) {
  const set = (t, k) => { if (t && !kind.has(t)) kind.set(t, k); };
  set(m.getNormalTexture(), 'normal');
  set(m.getBaseColorTexture(), 'color');
  set(m.getEmissiveTexture(), 'color');
  set(m.getMetallicRoughnessTexture(), 'data');
  set(m.getOcclusionTexture(), 'data');
}

const tmp = mkdtempSync(join(tmpdir(), 'pack-'));
const report = { textures: [] };
let i = 0;
for (const tex of root.listTextures()) {
  const k = kind.get(tex) ?? 'color';
  const ext = tex.getMimeType() === 'image/png' ? 'png' : 'jpg';
  const inFile = join(tmp, `t${i}.${ext}`);
  const outFile = join(tmp, `t${i}.ktx2`);
  writeFileSync(inFile, tex.getImage());
  const args = ['-ktx2', '-mipmap', inFile, '-output_file', outFile];
  if (k === 'normal') args.unshift('-uastc', '-uastc_level', '2', '-uastc_rdo_l', '2.0', '-ktx2_zstandard_level', '22', '-linear', '-normal_map');
  else if (k === 'data') args.unshift('-linear', '-q', '96', '-comp_level', '2');
  else args.unshift('-q', '128', '-comp_level', '2');
  execFileSync('nice', ['-n', '15', 'basisu', ...args], { stdio: 'ignore' });
  const bytes = readFileSync(outFile);
  report.textures.push({ name: tex.getName(), kind: k, size: tex.getSize(), from: tex.getImage().byteLength, to: bytes.byteLength });
  tex.setImage(new Uint8Array(bytes)).setMimeType('image/ktx2');
  i++;
}
rmSync(tmp, { recursive: true, force: true });
if (root.listTextures().length) doc.createExtension(KHRTextureBasisu).setRequired(true);

await doc.transform(
  dedup(),
  prune({ keepLeaves: true, keepAttributes: false, keepIndices: true }),
  weld(),
  draco({ method: 'edgebreaker', quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 12 }),
);
// No -y_flip here (unlike encode_ktx2.sh): glTF images keep their stored orientation, KTX2 included.
await io.write(dst, doc);

let tris = 0;
const meshes = [];
for (const mesh of root.listMeshes()) {
  let t = 0;
  for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices();
    t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  tris += t;
  meshes.push({ name: mesh.getName(), tris: t, primitives: mesh.listPrimitives().length });
}
report.file = dst;
report.bytes = statSync(dst).size;
report.textureBytes = report.textures.reduce((s, t) => s + t.to, 0);
report.triangles = tris;
report.primitives = meshes.reduce((s, m) => s + m.primitives, 0);
report.meshes = meshes;
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`packed ${dst}: ${(report.bytes / 1e6).toFixed(2)} MB, textures ${(report.textureBytes / 1e6).toFixed(2)} MB, ${tris} tris, ${report.primitives} primitives`);
