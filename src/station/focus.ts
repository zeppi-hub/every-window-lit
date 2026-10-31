import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import type { Kind } from '../season/model.js';
import { PLAZA_Y } from './layout.js';
import { CAR_Z } from './reactions.js';

/**
 * Where to look on a morning (META_VR_FIKIR.md §3, 1:00): a soft warm glow
 * on the ground at the place the week's prices show first, the kerb in
 * front of the row where the cars park for fuel (the coast road itself is
 * hidden by the jamb from the seat), and the stalls for groceries. Power shows in the evening
 * windows instead, so it has none. FocusSystem fades it in and out.
 */
export const FOCUS: Readonly<Partial<Record<Kind, { x: number; y: number; z: number; w: number; d: number }>>> = {
  fuel: { x: 1, y: PLAZA_Y + 0.02, z: CAR_Z + 0.4, w: 32, d: 5 },
  food: { x: 11.5, y: PLAZA_Y + 0.02, z: -17.6, w: 10, d: 5 },
};

export function createFocusGlow(): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const glow = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    // Even across most of it, soft only at the rim: from the seat the ground is seen at a grazing angle,
    // so a glow that fades from its centre shrinks to a hairline.
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const plane = new PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const glow = new Mesh(
    plane,
    // A warm amber wash rather than added light: added light vanishes on sunlit paving.
    new MeshBasicMaterial({ map: texture, color: 0xffb24a, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
  );
  glow.name = 'FocusGlow';
  glow.renderOrder = 1;
  glow.visible = false;
  return glow;
}
