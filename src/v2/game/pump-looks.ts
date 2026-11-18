import { CanvasTexture, Color, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace } from '@iwsdk/core';

/**
 * The drawn surfaces the pump scenes share (the farm's and the square's):
 * planed wood with its grain, and running water whose streaks slide along
 * it. Made on canvases here, so nothing is downloaded for them.
 */

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Planed boards: long grain lines, a few knots; the grain runs along the picture's width. */
export function woodGrain(base: number, seed = 3): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const colour = new Color(base);
    const css = (k: number): string => `rgb(${Math.round(Math.min(1, colour.r * k) * 255)},${Math.round(Math.min(1, colour.g * k) * 255)},${Math.round(Math.min(1, colour.b * k) * 255)})`;
    g.fillStyle = css(1.9);
    g.fillRect(0, 0, 256, 128);
    const rnd = seeded(seed);
    for (let k = 0; k < 70; k += 1) {
      const y = rnd() * 128;
      g.strokeStyle = css(1.1 + rnd() * 1.1);
      g.globalAlpha = 0.35 + rnd() * 0.4;
      g.lineWidth = 0.6 + rnd() * 1.8;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + k) * 2.5 + (rnd() - 0.5) * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (let k = 0; k < 4; k += 1) {
      const x = rnd() * 256;
      const y = rnd() * 128;
      const knot = g.createRadialGradient(x, y, 1, x, y, 7 + rnd() * 5);
      knot.addColorStop(0, css(0.7));
      knot.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = knot;
      g.fillRect(x - 14, y - 14, 28, 28);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** A wooden surface in that grain (the colour is in the picture, so the material itself is white). */
export function woodMaterial(base: number, seed = 3): MeshStandardMaterial {
  return new MeshStandardMaterial({ map: woodGrain(base, seed), roughness: 0.82 });
}

export interface RunningWater {
  material: MeshStandardMaterial;
  /** Slide the streaks along by `metres` (call every frame with speed times delta). */
  run(metres: number): void;
}

/**
 * Water that is seen to move: pale streaks and glints on its colour, sliding
 * along the picture's height (a strip's length, a stream's fall). `glow` is
 * how much it shines by itself (the treasury's gold does).
 */
export function runningWater(colour: number, glow: number, seed = 9): RunningWater {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g != null) {
    const base = new Color(colour);
    const css = (k: number, a = 1): string => `rgba(${Math.round(Math.min(1, base.r * k + (k > 1 ? (k - 1) * 0.5 : 0)) * 255)},${Math.round(Math.min(1, base.g * k + (k > 1 ? (k - 1) * 0.5 : 0)) * 255)},${Math.round(Math.min(1, base.b * k + (k > 1 ? (k - 1) * 0.5 : 0)) * 255)},${a})`;
    g.fillStyle = css(0.62);
    g.fillRect(0, 0, 64, 256);
    const rnd = seeded(seed);
    for (let k = 0; k < 46; k += 1) {
      const x = rnd() * 64;
      const y = rnd() * 256;
      const long = 30 + rnd() * 90;
      const streak = g.createLinearGradient(0, y, 0, y + long);
      streak.addColorStop(0, css(1.5, 0));
      streak.addColorStop(0.5, css(1.3 + rnd() * 0.9, 0.6 + rnd() * 0.4));
      streak.addColorStop(1, css(1.5, 0));
      g.fillStyle = streak;
      for (const wrap of [0, -256]) g.fillRect(x, y + wrap, 1.5 + rnd() * 3.5, long);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.92, emissive: colour, emissiveMap: texture, emissiveIntensity: glow, side: DoubleSide });
  return {
    material,
    run(metres: number): void {
      texture.offset.y = (texture.offset.y + metres) % 1;
    },
  };
}

let blobLook: MeshBasicMaterial | null = null;

/**
 * The dark, soft patch where a thing meets the ground: a flat disc `wide` by
 * `deep` metres, to lay just above the floor under it (where the scene has no
 * sun to throw a real shadow, or as well as one).
 */
export function contactShadow(wide: number, deep: number): Mesh {
  if (blobLook == null) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    if (g != null) {
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      r.addColorStop(0, 'rgba(0,0,0,0.62)');
      r.addColorStop(0.55, 'rgba(0,0,0,0.3)');
      r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
    }
    blobLook = new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false, fog: true });
  }
  const shape = new PlaneGeometry(wide, deep);
  shape.rotateX(-Math.PI / 2);
  const mesh = new Mesh(shape, blobLook);
  mesh.renderOrder = 1;
  return mesh;
}

/** Work cloth: a plain weave in `base`, a little worn (the farmer's overalls; nothing on it shines). */
export function workCloth(base: number, seed = 31): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const colour = new Color(base);
    const css = (k: number, a = 1): string => `rgba(${Math.round(Math.min(1, colour.r * k) * 255)},${Math.round(Math.min(1, colour.g * k) * 255)},${Math.round(Math.min(1, colour.b * k) * 255)},${a})`;
    g.fillStyle = css(1.6);
    g.fillRect(0, 0, 128, 128);
    const rnd = seeded(seed);
    // The twill's diagonal ribs, then worn patches.
    g.lineWidth = 1;
    for (let k = -128; k < 256; k += 3) {
      g.strokeStyle = css(1.15 + rnd() * 0.5, 0.55);
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 128, 128);
      g.stroke();
    }
    for (let k = 0; k < 14; k += 1) {
      const x = rnd() * 128;
      const y = rnd() * 128;
      const worn = g.createRadialGradient(x, y, 1, x, y, 10 + rnd() * 16);
      worn.addColorStop(0, css(2.1, 0.22));
      worn.addColorStop(1, css(2.1, 0));
      g.fillStyle = worn;
      g.fillRect(x - 26, y - 26, 52, 52);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}
