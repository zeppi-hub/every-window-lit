import type { Object3D } from '@iwsdk/core';

/**
 * Which path handle each hand or controller would take now (or holds),
 * set by PathHandleSystem every frame. PinchReachSystem then leaves that
 * pinch to it, and GripMarkSystem fills that handle's ring. A module of
 * its own so neither imports the other's system.
 */
const aims: Record<'left' | 'right', Object3D | null> = { left: null, right: null };

export function setPathAim(side: 'left' | 'right', thing: Object3D | null): void {
  aims[side] = thing;
}

export function pathAim(side: 'left' | 'right'): Object3D | null {
  return aims[side];
}
