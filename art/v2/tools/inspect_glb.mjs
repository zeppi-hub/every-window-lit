// Lists every mesh primitive of a GLB: material, triangles, bounds, texture sizes.
//   node art/v2/tools/inspect_glb.mjs <file.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(process.argv[2]);
const rows = [];
let total = 0, prims = 0;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices(); const pos = p.getAttribute('POSITION');
    const tris = (idx ? idx.getCount() : pos.getCount()) / 3;
    const mn = pos.getMinNormalized ? pos.getMin([]) : [0,0,0]; const mx = pos.getMax([]);
    const m = p.getMaterial();
    rows.push({ node: node.getName(), mat: m?.getName() ?? '-', tris, ext: mx.map((v, i) => +(v - mn[i]).toFixed(0)).join('x'), blend: m?.getAlphaMode() });
    total += tris; prims++;
  }
}
rows.sort((a, b) => b.tris - a.tris);
for (const r of rows) console.log(`${String(r.tris).padStart(7)}  ${r.mat.padEnd(34)} ${r.node.padEnd(30)} ${r.ext} ${r.blend}`);
console.log(`primitives ${prims}, triangles ${total}`);
