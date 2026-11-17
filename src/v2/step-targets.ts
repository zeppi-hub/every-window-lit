import type { Object3D } from '@iwsdk/core';

/**
 * What the new version's scene wants touched now (a perch, Gray's ear, the
 * watch's hand): GripMarkSystem rings these as it rings the current game's
 * next step. A module of its own so the scenes and the rings never import
 * each other.
 */
let targets: readonly Object3D[] = [];

export function setV2Targets(next: readonly Object3D[]): void {
  targets = next;
}

export function v2Targets(): readonly Object3D[] {
  return targets;
}
