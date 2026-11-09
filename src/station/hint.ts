import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, type Vector3 } from '@iwsdk/core';

/**
 * The ghost hand (META_VR_FIKIR.md §3, §7): a soft white hand drawn flat,
 * which shows the next gesture near the thing to touch, then fades. Two
 * poses: a pointing finger for pokes and taps, a pinch for pulls, slides
 * and reaching across the square. No words.
 */

/** The hand's size, about a real hand's. */
export const HINT_SIZE = 0.13;

/** How far the hand starts from its target's middle toward the Keeper's eye, and how far above it (m). */
export const HAND_LIFT = 0.07;
export const HAND_RISE = 0.04;
/**
 * At the family box's brass hook the hand starts 15 cm lower and pokes up
 * into it (POKE_UP): the family's line hangs just over the hook, and the
 * hand (drawn over everything) would cover it from above
 * (tests/family-box.test.mjs).
 */
export const HOOK_RISE = HAND_RISE - 0.15;
/**
 * At Nora's window the hand stands an arm's length out, this far to the left
 * of the line to the window (m). It is drawn over everything: on that line
 * it would hide the window, and below it, drawn back toward the Keeper, it
 * would cross the low line ("Nora's window. Reach, or tap the model.")
 * (tests/family-box.test.mjs). On the left its pinch, at the drawing's upper
 * right, is the part nearest the window.
 */
export const FAR_ASIDE = 0.11;
/** The last night's beat starts an arm's length out like the far window's, and this far below the line to the windows (m). */
export const CONDUCT_LIFT = -2;
export const CONDUCT_BELOW = 0.16;
/** Its pull: back toward the Keeper's eye, so it grows where it stands (m, world). */
export const FAR_PULL: readonly [number, number, number] = [0.044, 0.017, 0.12];
/** A poke's travel: a short tap downward (m, world). */
export const POKE_MOVE: readonly [number, number, number] = [0, -0.03, 0];
/** The same tap upward, for a poke from below (the family box's hook). */
export const POKE_UP: readonly [number, number, number] = [0, 0.03, 0];

/**
 * Where the hand starts a gesture whose target's middle is `anchor`, seen
 * from `eye`, into `out` (`toward` is scratch): `lift` toward the eye and
 * `rise` above; a negative lift is for the far window, an arm's length out
 * and beside the line to it (FAR_ASIDE).
 */
export function handStart(anchor: Vector3, eye: Vector3, lift: number, rise: number, out: Vector3, toward: Vector3): Vector3 {
  if (lift < 0) {
    toward.subVectors(anchor, eye).normalize();
    out.copy(eye).addScaledVector(toward, 0.42);
    out.x -= FAR_ASIDE;
    // The last night's beat: below the windows it lights, not over them.
    if (lift <= CONDUCT_LIFT) out.y -= CONDUCT_BELOW;
    return out;
  }
  toward.subVectors(eye, anchor).normalize();
  out.copy(anchor).addScaledVector(toward, lift);
  out.y += rise;
  return out;
}

export interface HintParts {
  hand: Mesh;
  point: CanvasTexture;
  pinch: CanvasTexture;
}

export function createHint(): HintParts {
  const point = handTexture(false);
  const pinch = handTexture(true);
  const hand = new Mesh(
    new PlaneGeometry(HINT_SIZE, HINT_SIZE),
    new MeshBasicMaterial({ map: point, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: DoubleSide }),
  );
  hand.name = 'GhostHand';
  // The pinch pose's texture travels with the mesh, for HintSystem to swap in.
  hand.userData.pinch = pinch;
  hand.renderOrder = 5;
  hand.visible = false;
  return { hand, point, pinch };
}

/** A right hand seen from its back, drawn as a soft outline with a pale fill: the index out, or the thumb and index pinched. */
function handTexture(pinched: boolean): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const draw = () => {
      // Palm.
      g.beginPath();
      g.roundRect(78, 120, 104, 96, 40);
      // Fingers: index (pointing or bent to the thumb), middle, ring, little, curled into the palm unless pointing.
      if (pinched) {
        g.roundRect(150, 70, 30, 66, 15);
        g.roundRect(118, 92, 28, 48, 14);
        g.roundRect(88, 100, 26, 42, 13);
        g.roundRect(60, 112, 24, 36, 12);
        // Thumb meeting the index tip.
        g.moveTo(182, 170);
        g.quadraticCurveTo(214, 132, 176, 74);
      } else {
        g.roundRect(138, 14, 30, 120, 15);
        g.roundRect(108, 92, 28, 48, 14);
        g.roundRect(80, 100, 26, 42, 13);
        g.roundRect(56, 112, 24, 36, 12);
        g.moveTo(182, 176);
        g.quadraticCurveTo(220, 160, 210, 120);
      }
    };
    g.fillStyle = 'rgba(255, 255, 255, 0.45)';
    draw();
    g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    g.lineWidth = 9;
    draw();
    g.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
