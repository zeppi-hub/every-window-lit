// The cold fire's stone wall as one tile, the way gold_brick_wall.glb is: one mesh, one material.
//   node art/v2/tools/stone_wall.mjs <out.glb>     then: node art/v2/tools/pack.mjs <out.glb> public/v2/nesne/stone_wall.glb
// A 1 m square facing +z, UV 0..1 across it (one unit = one metre, tiles both ways). The pictures are
// Rustic Stone Wall (Poly Haven, CC0) from public/v2/doku: colour, OpenGL normals, and roughness in the
// green channel of the metal-roughness map (metal 0).
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = process.argv[2];
if (!out) throw new Error('usage: stone_wall.mjs <out.glb>');
const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../public/v2/doku/rustic_stone_wall');

const rough = await sharp(join(dir, 'rough.jpg')).greyscale().raw().toBuffer({ resolveWithObject: true });
const { width, height } = rough.info;
const mr = Buffer.alloc(width * height * 3);
for (let i = 0; i < width * height; i += 1) mr[i * 3 + 1] = rough.data[i];
const mrJpg = await sharp(mr, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();

const doc = new Document();
const buffer = doc.createBuffer();
const tex = (name, bytes) => doc.createTexture(name).setImage(bytes).setMimeType('image/jpeg');
const material = doc
  .createMaterial('stone_wall')
  .setBaseColorTexture(tex('stone_wall_diff', readFileSync(join(dir, 'diff.jpg'))))
  .setNormalTexture(tex('stone_wall_nor', readFileSync(join(dir, 'nor.jpg'))))
  .setMetallicRoughnessTexture(tex('stone_wall_rough', mrJpg))
  .setMetallicFactor(0)
  .setRoughnessFactor(1);

// glTF UV: v = 0 at the picture's top, so the top edge of the square gets v = 0.
const position = doc.createAccessor().setType('VEC3').setBuffer(buffer)
  .setArray(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]));
const normal = doc.createAccessor().setType('VEC3').setBuffer(buffer)
  .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]));
const uv = doc.createAccessor().setType('VEC2').setBuffer(buffer)
  .setArray(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]));
const indices = doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Uint16Array([0, 1, 2, 0, 2, 3]));
const prim = doc.createPrimitive().setMaterial(material).setIndices(indices)
  .setAttribute('POSITION', position).setAttribute('NORMAL', normal).setAttribute('TEXCOORD_0', uv);
const mesh = doc.createMesh('stone_wall_piece').addPrimitive(prim);
const node = doc.createNode('stone_wall_piece').setMesh(mesh);
doc.createScene('stone_wall').addChild(node);
doc.getRoot().getAsset().generator = 'art/v2/tools/stone_wall.mjs';
await new NodeIO().write(out, doc);
