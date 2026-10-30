import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { box, PartBuilder, WORLD } from './facade.js';
import { PLAZA_Y } from './layout.js';
import { plain } from './materials.js';

/**
 * The island side of a weather week (season/model.ts Weather), seen from
 * the window: a rain curtain over the square in a storm, smoke from the
 * row's chimneys in a cold snap. Heat closes shutters through the window
 * glass shader (materials.ts), and the sky's tone is the evening system's.
 * The week's real weather number comes up on a small slip with the card.
 */

/** Chimney stacks on the row's roofs, behind the facades; the smoke rises from their tops. */
export const CHIMNEYS: ReadonlyArray<readonly [number, number, number]> = [
  [-18.6, PLAZA_Y + 18.2, -39],
  [-11.2, PLAZA_Y + 13.6, -35],
  [-6.6, PLAZA_Y + 13.6, -35],
  [0.4, PLAZA_Y + 18.1, -37],
  [17.8, PLAZA_Y + 19.6, -36],
  [24.2, PLAZA_Y + 17.4, -34],
];
const STACK_HEIGHT = 1.3;
/** Puffs per chimney, each rising this far over its life. */
export const PUFFS = 5;
export const PUFF_RISE = 3.2;

/** The rain falls through this box in front of the tower; two stacked copies make it loop. */
export const RAIN = { x0: -14, x1: 14, z0: -0.9, z1: -28, y0: PLAZA_Y, height: 22 } as const;
const STREAKS = 900;

/** The weather slip, 12 by 6 cm, propped beside the week's card. */
export const SLIP_SIZE = { w: 0.12, h: 0.06 } as const;
/** From the week's card: left of it in the basket and on the sill. */
export const SLIP_OFFSET = { x: -0.155, y: -0.012 } as const;

export interface WeatherParts {
  group: Group;
  rain: Mesh;
  smoke: InstancedMesh;
  slip: Group;
  slipTexture: CanvasTexture;
}

export function createWeather(): WeatherParts {
  const group = new Group();
  group.name = 'Weather';

  // Brick stacks with a stone cap; they stand whatever the week.
  const stacks = new PartBuilder();
  for (const [x, y, z] of CHIMNEYS) {
    stacks.color(0x8a4a3a);
    box(stacks, WORLD, x - 0.35, y - 0.4, z - 0.35, x + 0.35, y + STACK_HEIGHT, z + 0.35);
    stacks.color(0xd8d0c2);
    box(stacks, WORLD, x - 0.42, y + STACK_HEIGHT, z - 0.42, x + 0.42, y + STACK_HEIGHT + 0.12, z + 0.42);
  }
  group.add(stacks.mesh(plain(0.9), 'ChimneyStacks'));

  const smoke = new InstancedMesh(
    new SphereGeometry(0.5, 10, 8),
    new MeshBasicMaterial({ color: 0xdcdad6, transparent: true, opacity: 0.42, depthWrite: false }),
    CHIMNEYS.length * PUFFS,
  );
  smoke.name = 'ChimneySmoke';
  smoke.visible = false;
  smoke.frustumCulled = false;
  group.add(smoke);

  const rain = new Mesh(rainGeometry(), new MeshBasicMaterial({ color: 0xc9d4dc, transparent: true, opacity: 0.32, depthWrite: false }));
  rain.name = 'Rain';
  rain.visible = false;
  rain.frustumCulled = false;
  group.add(rain);

  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 240;
  const slipTexture = new CanvasTexture(canvas);
  slipTexture.colorSpace = SRGBColorSpace;
  slipTexture.anisotropy = 4;
  const slip = new Group();
  slip.name = 'WeatherSlip';
  const face = new Mesh(new PlaneGeometry(SLIP_SIZE.w, SLIP_SIZE.h), new MeshBasicMaterial({ map: slipTexture }));
  const back = new Mesh(new PlaneGeometry(SLIP_SIZE.w, SLIP_SIZE.h), new MeshStandardMaterial({ color: 0xdfe6e8, roughness: 0.95, side: DoubleSide }));
  back.position.z = -0.0008;
  slip.add(face, back);
  slip.visible = false;
  return { group, rain, smoke, slip, slipTexture };
}

/** Thin falling streaks in the rain box, twice over, one copy a box-height above the other. */
function rainGeometry(): BufferGeometry {
  const streak = new BoxGeometry(0.012, 0.55, 0.012).toNonIndexed();
  const shape = streak.getAttribute('position').array as Float32Array;
  const positions: number[] = [];
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let copy = 0; copy < 2; copy += 1) {
    for (let k = 0; k < STREAKS; k += 1) {
      const x = RAIN.x0 + random() * (RAIN.x1 - RAIN.x0);
      const z = RAIN.z0 + random() * (RAIN.z1 - RAIN.z0);
      const y = RAIN.y0 + random() * RAIN.height + copy * RAIN.height;
      for (let i = 0; i < shape.length; i += 3) positions.push(shape[i] + x + shape[i + 1] * 0.08, shape[i + 1] + y, shape[i + 2] + z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

/** The slip's face: the real number in large type over the real place and month. */
export function drawSlip(texture: CanvasTexture, label: string, month: string): void {
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return;
  const { width: w, height: h } = canvas;
  g.fillStyle = '#e8eef0';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#8fa3ab';
  g.lineWidth = 5;
  g.strokeRect(12, 12, w - 24, h - 24);
  g.fillStyle = '#26323a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 50px Georgia, "Times New Roman", serif';
  g.fillText(label, w / 2, 92, w - 48);
  g.fillStyle = '#56656c';
  g.font = '500 30px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.fillText(`Real weather · Naples area · ${month}`, w / 2, 168, w - 48);
  texture.needsUpdate = true;
}
