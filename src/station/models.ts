import { AssetManager, InstancedMesh, Matrix4, type Mesh, type MeshPhysicalMaterial, type MeshStandardMaterial, Vector3 } from '@iwsdk/core';
import type { Frame } from './facade.js';
import { indoors, outdoors } from './materials.js';

/**
 * The prepared models in public/models (art/models/process.py; sources and
 * licences in CREDITS.md). Each is loaded before the station is built; the
 * editor, which loads none, falls back to the procedural shapes.
 */

/**
 * A model material's copy for this game: never transmissive (three would
 * render the whole scene again per eye for it), whatever the file says.
 */
function own(material: MeshStandardMaterial): MeshStandardMaterial {
  const copy = material.clone();
  const physical = copy as MeshPhysicalMaterial;
  if (physical.isMeshPhysicalMaterial === true) physical.transmission = 0;
  return copy;
}

/** Whether a model is loaded (the editor loads none). */
export function hasModel(key: string): boolean {
  return AssetManager.getGLTF(key) != null;
}

/** A frame (origin, x along the piece, up, z its front) as a placement matrix, optionally scaled. */
export function frameMatrix(f: Frame, scale = 1): Matrix4 {
  const m = new Matrix4().makeBasis(new Vector3(...f.t), new Vector3(...f.up), new Vector3(...f.n));
  m.scale(new Vector3(scale, scale, scale));
  return m.setPosition(new Vector3(...f.o));
}

/** A named mesh of a loaded model, or null when the model is not there. */
export function modelMesh(key: string, name: string): Mesh | null {
  const found = AssetManager.getGLTF(key)?.scene.getObjectByName(name) as Mesh | undefined;
  return found?.isMesh === true ? found : null;
}

/** A copy of a model's mesh with its own material, lit like the room; null when the model is not there. */
export function indoorMesh(key: string, name: string, as: string): Mesh | null {
  const source = modelMesh(key, name);
  if (source == null) return null;
  const mesh = source.clone();
  mesh.material = indoors(own(source.material as MeshStandardMaterial));
  mesh.name = as;
  return mesh;
}

/**
 * A loaded model as instanced meshes, one per material, `homes.length`
 * instances at those matrices, shaded like the street; null when the model
 * is not there. `slots`, when given, are the indices (in some longer list
 * of places) these instances stand for, for showing and hiding them by
 * those indices (see showFirst in reactions.ts).
 */
export function modelInstances(key: string, name: string, homes: readonly Matrix4[], slots?: readonly number[]): InstancedMesh[] | null {
  const scene = AssetManager.getGLTF(key)?.scene;
  if (scene == null) return null;
  scene.updateMatrixWorld(true);
  const meshes: InstancedMesh[] = [];
  scene.traverse((object) => {
    const source = object as Mesh;
    if (source.isMesh !== true) return;
    const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
    const material = outdoors(own(source.material as MeshStandardMaterial));
    const mesh = new InstancedMesh(geometry, material, homes.length);
    mesh.name = name;
    homes.forEach((home, i) => mesh.setMatrixAt(i, home));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (slots != null) mesh.userData.slots = slots;
    meshes.push(mesh);
  });
  return meshes;
}
