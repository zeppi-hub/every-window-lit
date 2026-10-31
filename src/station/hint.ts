import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

/**
 * The ghost hand (META_VR_FIKIR.md §3, §7): a soft white hand drawn flat,
 * which shows the next gesture near the thing to touch, then fades. Two
 * poses: a pointing finger for pokes and taps, a pinch for pulls, slides
 * and reaching across the square. No words.
 */

/** The hand's size, about a real hand's. */
export const HINT_SIZE = 0.13;

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

/** "Put the controllers down.": shown by HandsSystem while the headset reports controllers and no hands. */
export function createHandsSign(): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = 'rgba(20, 18, 16, 0.8)';
    g.beginPath();
    g.roundRect(6, 6, 500, 84, 30);
    g.fill();
    g.fillStyle = '#f6f1e6';
    g.font = '600 40px system-ui, -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Put the controllers down.', 256, 48, 470);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sign = new Mesh(new PlaneGeometry(0.32, 0.06), new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  sign.name = 'HandsSign';
  sign.renderOrder = 6;
  sign.visible = false;
  return sign;
}
