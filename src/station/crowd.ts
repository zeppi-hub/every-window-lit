import {
  AnimationMixer,
  AssetManager,
  BufferGeometry,
  DataTexture,
  DataUtils,
  DynamicDrawUsage,
  Float32BufferAttribute,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RGBAFormat,
  type SkinnedMesh,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from '@iwsdk/core';
import { outdoors } from './materials.js';

/**
 * Townsfolk from animated character models (CREDITS.md), drawn as one
 * instanced mesh per character with their movement baked into textures
 * ("vertex animation"): at load, each clip is played through and every
 * vertex's position and normal at every frame is written to a texture; the
 * shader then reads a person's frame from it. So a crowd walks, stands and
 * waves for one draw call per character, with no skeletons at run time.
 *
 * Clips: a walk cycle (two steps), standing idle, and a wave made here by
 * raising the right arm of the idle pose, since the models have none.
 * Colours: skin, the main garment and hair are set per person (aSkin,
 * aCloth, aHair), so a few models make a varied crowd.
 */

export interface Clip {
  /** First frame in the texture, number of frames, and the loop's length in seconds. */
  start: number;
  frames: number;
  seconds: number;
}

/** The baked crowds, filled when the station is built; FolkSystem draws the townsfolk with them when there are any. */
export const crowds: Crowd[] = [];

export interface Crowd {
  mesh: InstancedMesh;
  walk: Clip;
  idle: Clip;
  wave: Clip;
  /** Per person: (frame a, frame b, mix) and the three colours. */
  frame: InstancedBufferAttribute;
  skin: InstancedBufferAttribute;
  cloth: InstancedBufferAttribute;
  hair: InstancedBufferAttribute;
}

/** Texture width in texels; rows hold vertices frame after frame. */
const WIDTH = 1024;
const WALK_FRAMES = 16;
const IDLE_FRAMES = 12;
const WAVE_FRAMES = 10;
const WAVE_SECONDS = 1.1;
/** Per-vertex colour classes, from the model's material names. */
const KEEP = 0;
const SKIN = 1;
const CLOTH = 2;
const HAIR = 3;

function kindOf(material: Material): number {
  const name = material.name.toLowerCase();
  if (name.includes('skin')) return SKIN;
  if (name.includes('hair')) return HAIR;
  if (name.includes('shirt') || name.includes('dress') || name.includes('coat') || name.includes('jacket')) return CLOTH;
  return KEEP;
}

/** The model's clip whose name ends with `suffix` (Quaternius names them Armature|Man_Walk and so on). */
function clipNamed(key: string, suffix: string) {
  const gltf = AssetManager.getGLTF(key);
  return gltf?.animations.find((clip) => clip.name.toLowerCase().endsWith(suffix)) ?? null;
}

/**
 * Bakes a loaded character model into an instanced crowd of `count` people,
 * `height` metres tall standing, feet at y = 0, facing +z (found from where
 * its eyes are) turned by `facing`. Null when the
 * model is not loaded or lacks a walk and an idle clip.
 */
export function bakeCrowd(key: string, name: string, count: number, height: number, facing = 0): Crowd | null {
  const gltf = AssetManager.getGLTF(key);
  const walkClip = clipNamed(key, '_walk');
  const idleClip = clipNamed(key, '_idle');
  if (gltf == null || walkClip == null || idleClip == null) return null;
  const root = gltf.scene;
  const parts: SkinnedMesh[] = [];
  root.traverse((object) => {
    if ((object as SkinnedMesh).isSkinnedMesh === true) parts.push(object as SkinnedMesh);
  });
  if (parts.length === 0) return null;

  // One geometry of all parts, with a colour and a colour class per vertex.
  const colours: number[] = [];
  const kinds: number[] = [];
  const eyes: boolean[] = [];
  const indices: number[] = [];
  let verts = 0;
  for (const part of parts) {
    const g = part.geometry;
    const n = g.getAttribute('position').count;
    const groups = g.groups.length > 0 ? g.groups : [{ start: 0, count: g.index?.count ?? n, materialIndex: 0 }];
    const materials = Array.isArray(part.material) ? part.material : [part.material];
    const vertexKind = new Int8Array(n).fill(-1);
    const index = g.index;
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0];
      for (let k = group.start; k < group.start + group.count; k += 1) {
        const v = index != null ? index.getX(k) : k;
        indices.push(verts + v);
        if (vertexKind[v] < 0) vertexKind[v] = materials.indexOf(material);
      }
    }
    for (let v = 0; v < n; v += 1) {
      const material = materials[Math.max(0, vertexKind[v])] as MeshStandardMaterial;
      colours.push(material.color.r, material.color.g, material.color.b);
      kinds.push(kindOf(material));
      eyes.push(material.name.toLowerCase().includes('eye'));
    }
    verts += n;
  }

  const walk: Clip = { start: 0, frames: WALK_FRAMES, seconds: walkClip.duration };
  const idle: Clip = { start: WALK_FRAMES, frames: IDLE_FRAMES, seconds: idleClip.duration };
  const wave: Clip = { start: WALK_FRAMES + IDLE_FRAMES, frames: WAVE_FRAMES, seconds: WAVE_SECONDS };
  const frames = WALK_FRAMES + IDLE_FRAMES + WAVE_FRAMES;
  const rows = Math.ceil((verts * frames) / WIDTH);
  const positions = new Float32Array(WIDTH * rows * 4);
  const normals = new Float32Array(WIDTH * rows * 4);

  const mixer = new AnimationMixer(root);
  // three drops the dot from glTF node names (UpperArm.R becomes UpperArmR).
  const upper = root.getObjectByName('UpperArmR') ?? root.getObjectByName('UpperArm.R') ?? null;
  const lower = root.getObjectByName('LowerArmR') ?? root.getObjectByName('LowerArm.R') ?? null;
  if (import.meta.env.DEV && (upper == null || lower == null)) console.warn('[crowd] no right arm bones in', key, '(no wave)');
  const raw: Float32Array[] = [];
  const pose = (clip: typeof walkClip, t: number, waving = -1) => {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.reset().play();
    mixer.setTime(t);
    if (waving >= 0 && upper != null && lower != null) raiseArm(root, upper, lower, waving);
    root.updateMatrixWorld(true);
    const frame = new Float32Array(verts * 6);
    let o = 0;
    for (const part of parts) o = skinPose(part, frame, o);
    raw.push(frame);
  };
  for (let f = 0; f < WALK_FRAMES; f += 1) pose(walkClip, (f / WALK_FRAMES) * walkClip.duration);
  for (let f = 0; f < IDLE_FRAMES; f += 1) pose(idleClip, (f / IDLE_FRAMES) * idleClip.duration);
  for (let f = 0; f < WAVE_FRAMES; f += 1) pose(idleClip, 0, f / WAVE_FRAMES);
  mixer.stopAllAction();

  // Standing height, feet on the ground, centred over the origin, turned to face +z.
  let minY = Infinity;
  let maxY = -Infinity;
  let cx = 0;
  let cz = 0;
  const rest = raw[WALK_FRAMES];
  for (let v = 0; v < verts; v += 1) {
    minY = Math.min(minY, rest[v * 6 + 1]);
    maxY = Math.max(maxY, rest[v * 6 + 1]);
    cx += rest[v * 6];
    cz += rest[v * 6 + 2];
  }
  cx /= verts;
  cz /= verts;
  // Which way the model faces: from the middle of the head to the eyes, at standing height.
  let hx = 0;
  let hz = 0;
  let hn = 0;
  let ex = 0;
  let ez = 0;
  let en = 0;
  for (let v = 0; v < verts; v += 1) {
    if (rest[v * 6 + 1] < minY + 0.85 * (maxY - minY)) continue;
    hx += rest[v * 6];
    hz += rest[v * 6 + 2];
    hn += 1;
    if (eyes[v]) {
      ex += rest[v * 6];
      ez += rest[v * 6 + 2];
      en += 1;
    }
  }
  const front = hn > 0 && en > 0 ? Math.atan2(ex / en - hx / hn, ez / en - hz / hn) : 0;
  if (import.meta.env.DEV) console.info('[crowd]', key, 'faces', ((front * 180) / Math.PI).toFixed(0), 'degrees from +z');
  const s = height / (maxY - minY);
  const c = Math.cos(facing - front);
  const sn = Math.sin(facing - front);
  raw.forEach((frame, f) => {
    for (let v = 0; v < verts; v += 1) {
      const i = v * 6;
      const x = (frame[i] - cx) * s;
      const z = (frame[i + 2] - cz) * s;
      const t = (f * verts + v) * 4;
      positions[t] = x * c + z * sn;
      positions[t + 1] = (frame[i + 1] - minY) * s;
      positions[t + 2] = -x * sn + z * c;
      const nx = frame[i + 3];
      const nz = frame[i + 5];
      normals[t] = nx * c + nz * sn;
      normals[t + 1] = frame[i + 4];
      normals[t + 2] = -nx * sn + nz * c;
    }
  });

  const geometry = new BufferGeometry();
  // Positions are read from the texture; this one only sizes the draw and gives the bounds.
  const first = new Float32Array(verts * 3);
  for (let v = 0; v < verts; v += 1) {
    first[v * 3] = positions[(WALK_FRAMES * verts + v) * 4];
    first[v * 3 + 1] = positions[(WALK_FRAMES * verts + v) * 4 + 1];
    first[v * 3 + 2] = positions[(WALK_FRAMES * verts + v) * 4 + 2];
  }
  geometry.setAttribute('position', new Float32BufferAttribute(first, 3));
  const up = new Float32Array(verts * 3);
  for (let v = 0; v < verts; v += 1) up[v * 3 + 1] = 1;
  geometry.setAttribute('normal', new Float32BufferAttribute(up, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  geometry.setAttribute('aKind', new Float32BufferAttribute(kinds, 1));
  geometry.setIndex(indices);
  const frame = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const skin = new InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
  const cloth = new InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
  const hair = new InstancedBufferAttribute(new Float32Array(count * 3).fill(0.1), 3);
  for (const attribute of [frame, skin, cloth, hair]) attribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aFrame', frame);
  geometry.setAttribute('aSkin', skin);
  geometry.setAttribute('aCloth', cloth);
  geometry.setAttribute('aHair', hair);

  const texture = (data: Float32Array) => {
    const half = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i += 1) half[i] = DataUtils.toHalfFloat(data[i]);
    const t = new DataTexture(half, WIDTH, rows, RGBAFormat, HalfFloatType);
    t.needsUpdate = true;
    return t;
  };
  const material = crowdMaterial(texture(positions), texture(normals), verts);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.frustumCulled = false;
  return { mesh, walk, idle, wave, frame, skin, cloth, hair };
}

/**
 * The crowd's material: shaded like the street, its vertices read from the
 * baked textures at each person's frames, skin, coat and hair coloured per
 * person. Built here, apart from the bake, so the shader hook holds on to
 * the textures only and not the bake's working arrays.
 */
function crowdMaterial(positions: DataTexture, normals: DataTexture, verts: number): MeshStandardMaterial {
  const material = outdoors(new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  const uniforms = { uVatPos: { value: positions }, uVatNor: { value: normals }, uVatVerts: { value: verts } };
  const street = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    street(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform highp sampler2D uVatPos;
uniform highp sampler2D uVatNor;
uniform int uVatVerts;
attribute vec3 aFrame;
attribute float aKind;
attribute vec3 aSkin;
attribute vec3 aCloth;
attribute vec3 aHair;
vec3 vatAt( highp sampler2D map, float frame ) {
  int i = int( frame ) * uVatVerts + gl_VertexID;
  return texelFetch( map, ivec2( i % ${WIDTH}, i / ${WIDTH} ), 0 ).xyz;
}`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize( mix( vatAt( uVatNor, aFrame.x ), vatAt( uVatNor, aFrame.y ), aFrame.z ) );')
      .replace('#include <begin_vertex>', 'vec3 transformed = mix( vatAt( uVatPos, aFrame.x ), vatAt( uVatPos, aFrame.y ), aFrame.z );')
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
  if ( aKind > 0.5 && aKind < 1.5 ) vColor.rgb = aSkin;
  else if ( aKind > 1.5 && aKind < 2.5 ) vColor.rgb = aCloth;
  else if ( aKind > 2.5 ) vColor.rgb = aHair;`,
      );
  };
  material.customProgramCacheKey = () => 'crowd-vat';
  return material;
}

const bones = new Matrix4();
const world = new Matrix4();

/**
 * Skins every vertex of `part` in its current pose into `out` from offset
 * `o` (x, y, z, then the normal), in world space: one blended bone matrix
 * per vertex, applied to the position and the normal. Returns the next offset.
 */
function skinPose(part: SkinnedMesh, out: Float32Array, o: number): number {
  const skeleton = part.skeleton;
  const count = skeleton.bones.length;
  // Per bone: mesh world * bind inverse * bone world * bone inverse * bind.
  const m = new Float32Array(count * 16);
  for (let b = 0; b < count; b += 1) {
    bones.multiplyMatrices(skeleton.bones[b].matrixWorld, skeleton.boneInverses[b]);
    world.multiplyMatrices(part.matrixWorld, part.bindMatrixInverse).multiply(bones).multiply(part.bindMatrix);
    m.set(world.elements, b * 16);
  }
  const g = part.geometry;
  const position = g.getAttribute('position');
  const normal = g.getAttribute('normal');
  const index = g.getAttribute('skinIndex');
  const weight = g.getAttribute('skinWeight');
  const e = new Float32Array(12);
  for (let v = 0; v < position.count; v += 1) {
    e.fill(0);
    for (let j = 0; j < 4; j += 1) {
      const w = weight.getComponent(v, j);
      if (w === 0) continue;
      const at = index.getComponent(v, j) * 16;
      // Column-major: 0..2, 4..6 and 8..10 rotate and scale, 12..14 translate.
      e[0] += w * m[at];
      e[1] += w * m[at + 1];
      e[2] += w * m[at + 2];
      e[3] += w * m[at + 4];
      e[4] += w * m[at + 5];
      e[5] += w * m[at + 6];
      e[6] += w * m[at + 8];
      e[7] += w * m[at + 9];
      e[8] += w * m[at + 10];
      e[9] += w * m[at + 12];
      e[10] += w * m[at + 13];
      e[11] += w * m[at + 14];
    }
    const x = position.getX(v);
    const y = position.getY(v);
    const z = position.getZ(v);
    out[o] = e[0] * x + e[3] * y + e[6] * z + e[9];
    out[o + 1] = e[1] * x + e[4] * y + e[7] * z + e[10];
    out[o + 2] = e[2] * x + e[5] * y + e[8] * z + e[11];
    const nx = normal.getX(v);
    const ny = normal.getY(v);
    const nz = normal.getZ(v);
    const ox = e[0] * nx + e[3] * ny + e[6] * nz;
    const oy = e[1] * nx + e[4] * ny + e[7] * nz;
    const oz = e[2] * nx + e[5] * ny + e[8] * nz;
    const len = Math.hypot(ox, oy, oz) || 1;
    out[o + 3] = ox / len;
    out[o + 4] = oy / len;
    out[o + 5] = oz / len;
    o += 6;
  }
  return o;
}

const axis = new Vector3();
const turn = new Quaternion();
const parentTurn = new Quaternion();

/** Raises the right arm of the current pose for a wave at phase t (0..1): the upper arm up and out, the forearm swinging. */
function raiseArm(root: Object3D, upper: Object3D, lower: Object3D, t: number): void {
  root.updateMatrixWorld(true);
  rotateInWorld(upper, axis.set(0, 0, 1), -2.3);
  root.updateMatrixWorld(true);
  rotateInWorld(lower, axis.set(0, 0, 1), -0.5 + 0.45 * Math.sin(t * Math.PI * 2));
}

/** Turns a bone by `angle` about a world-space axis, keeping the rest of the hierarchy. */
function rotateInWorld(bone: Object3D, worldAxis: Vector3, angle: number): void {
  bone.parent?.getWorldQuaternion(parentTurn);
  turn.setFromAxisAngle(worldAxis, angle);
  // local' = parent^-1 * world-turn * parent * local
  const inverse = parentTurn.clone().invert();
  bone.quaternion.premultiply(inverse.multiply(turn).multiply(parentTurn));
}
