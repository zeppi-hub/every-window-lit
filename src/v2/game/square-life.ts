import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BoxGeometry, BufferAttribute, type BufferGeometry, CanvasTexture, Color, ConeGeometry, DoubleSide, Euler, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, type Object3D, PlaneGeometry, Quaternion, Raycaster, SphereGeometry, SRGBColorSpace, Vector3, type World } from '@iwsdk/core';

/**
 * A little life on the paving in front of the bench in 2041 (S03): six
 * pigeons that peck, walk and now and then flutter a few steps on, and a sheet
 * of newspaper the wind turns over along the kerb. All of it low, under the
 * line from the bench to the three people, so nothing stands between the
 * bird and its choice. Three draws: the pigeons, their wings, the sheet.
 */

const BIRDS = 6;
/** Where they gather (x, z): left, right and middle of the paving, short of the road. */
const PATCHES: readonly (readonly [number, number])[] = [
  [-1.9, -5.4],
  [2.9, -5.6],
  [0.5, -6.3],
];
/** The sheet's line along the kerb (z), where it comes in and where it is taken back to the start (x). */
const SHEET = { z: -6.75, from: -8, start: -4.2, to: 7.2, rest: 2.4, gust: 2.1, step: 3.1 } as const;

const DOWN = new Vector3(0, -1, 0);
const UP = new Vector3(0, 1, 0);

const smooth = (k: number) => k * k * (3 - 2 * k);

/** A shape in one flat colour, ready to be joined with others. */
function tinted(shape: BufferGeometry, colour: number): BufferGeometry {
  const flat = shape.index != null ? shape.toNonIndexed() : shape;
  flat.deleteAttribute('uv');
  const c = new Color(colour);
  const colours = new Float32Array(flat.getAttribute('position').count * 3);
  for (let i = 0; i < colours.length; i += 3) {
    colours[i] = c.r;
    colours[i + 1] = c.g;
    colours[i + 2] = c.b;
  }
  flat.setAttribute('color', new BufferAttribute(colours, 3));
  return flat;
}

/** A town pigeon, about 30 cm from beak to tail: feet at the origin, facing +z. */
function pigeon(): BufferGeometry {
  const parts = [
    // Body, chest up; the green-grey neck; the head; the beak; the tail; the folded wings; the red legs.
    tinted(new SphereGeometry(1, 10, 8).scale(0.075, 0.068, 0.13).rotateX(-0.22).translate(0, 0.1, 0), 0x666c76),
    tinted(new SphereGeometry(1, 8, 6).scale(0.045, 0.062, 0.046).translate(0, 0.155, 0.085), 0x3d5c55),
    tinted(new SphereGeometry(0.033, 8, 6).translate(0, 0.212, 0.1), 0x4b525d),
    tinted(new ConeGeometry(0.009, 0.032, 6).rotateX(Math.PI / 2).translate(0, 0.207, 0.143), 0x33312f),
    tinted(new BoxGeometry(0.07, 0.012, 0.1).rotateX(-0.15).translate(0, 0.085, -0.155), 0x2f333a),
    tinted(new SphereGeometry(1, 8, 6).scale(0.02, 0.05, 0.105).rotateX(-0.2).translate(0.066, 0.11, -0.025), 0x50565f),
    tinted(new SphereGeometry(1, 8, 6).scale(0.02, 0.05, 0.105).rotateX(-0.2).translate(-0.066, 0.11, -0.025), 0x50565f),
    tinted(new BoxGeometry(0.008, 0.045, 0.008).translate(0.024, 0.0225, 0.01), 0xb5565c),
    tinted(new BoxGeometry(0.008, 0.045, 0.008).translate(-0.024, 0.0225, 0.01), 0xb5565c),
  ];
  return mergeGeometries(parts) ?? parts[0];
}

/** A printed page: a masthead bar, a picture block and lines of grey type, no words. */
function page(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#e4dccb';
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#2c2925';
    g.fillRect(14, 12, 228, 20);
    g.fillStyle = '#8f887b';
    g.fillRect(14, 44, 96, 70);
    g.fillStyle = '#6f695f';
    for (let row = 0; row < 12; row += 1) {
      const y = 44 + row * 11;
      if (row < 7) g.fillRect(122, y, 120 - ((row * 37) % 23), 4);
      else g.fillRect(14, y + 4, 228 - ((row * 53) % 41), 4);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The paving's height at (x, z): the first thing under knee height, looking down. */
function floorAt(root: Object3D | null, x: number, z: number, otherwise: number): number {
  if (root == null) return otherwise;
  const drop = new Raycaster(new Vector3(x, 1.5, z), DOWN, 0, 2.5);
  for (const hit of drop.intersectObject(root, true)) if (hit.point.y < 0.7) return hit.point.y;
  return otherwise;
}

interface Bird {
  at: Vector3;
  yaw: number;
  patch: number;
  home: Vector3;
  phase: number;
  flight: { from: Vector3; to: Vector3; t: number; span: number; high: number; away: boolean } | null;
}

export interface SquareLife {
  /** Every frame; false once everything has gone and nothing more is drawn. */
  update(delta: number): boolean;
  /** The pigeons take off and leave over the roofs; the sheet is gone with them. */
  scatter(): void;
  /** What was built, for the stage to hide with the city. */
  readonly things: Object3D[];
}

/**
 * Build the pigeons and the sheet. `city` is the city's model (for the
 * paving's height), `ground` the height to use if it cannot be found, and
 * `flap` is called when birds take off (a sound).
 */
export function makeSquareLife(world: World, city: Object3D | null, ground: number, flap: (birds: number) => void): SquareLife {
  const floor = floorAt(city, 0.6, -5.8, ground);

  const bodies = new InstancedMesh(pigeon(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), BIRDS);
  bodies.name = 'SquarePigeons';
  // Two wings a bird, drawn only in the air: a flat blade from the shoulder outward.
  const wings = new InstancedMesh(new PlaneGeometry(0.2, 0.1).rotateX(-Math.PI / 2).translate(0.1, 0, -0.01), new MeshStandardMaterial({ color: 0x5a606a, roughness: 0.85, side: DoubleSide }), BIRDS * 2);
  wings.name = 'SquarePigeonWings';
  const sheet = new Mesh(new PlaneGeometry(0.34, 0.25), new MeshStandardMaterial({ map: page(), side: DoubleSide, roughness: 0.95 }));
  sheet.name = 'BlownNewspaper';
  sheet.rotation.order = 'YXZ';
  const things: Object3D[] = [bodies, wings, sheet];
  for (const thing of things) {
    thing.pointerEvents = 'none';
    thing.frustumCulled = false;
    world.createTransformEntity(thing, { persistent: true });
  }

  const birds: Bird[] = [];
  for (let i = 0; i < BIRDS; i += 1) {
    const patch = i % PATCHES.length;
    const home = spot(patch, i, new Vector3());
    birds.push({ at: home.clone(), yaw: i * 1.9, patch, home, phase: (i * 0.37) % 1, flight: null });
  }

  function spot(patch: number, i: number, into: Vector3): Vector3 {
    const [x, z] = PATCHES[patch];
    const angle = i * 2.4;
    const far = 0.3 + ((i * 7) % 5) * 0.14;
    return into.set(x + Math.sin(angle) * far, floor, z + Math.cos(angle) * far * 0.7);
  }

  const put = new Matrix4();
  const wing = new Matrix4();
  const local = new Matrix4();
  const turn = new Quaternion();
  const tilt = new Euler(0, 0, 0, 'YXZ');
  const one = new Vector3(1, 1, 1);
  const none = new Matrix4().makeScale(0, 0, 0);
  const shoulder = new Vector3();
  const flapTurn = new Quaternion();
  const about = new Quaternion().setFromAxisAngle(UP, Math.PI);
  const Z = new Vector3(0, 0, 1);

  let clock = 0;
  let nextFlight = 3.2;
  let round = 0;
  let gone = false;
  let leaving = false;
  // The sheet: lying still, then a gust takes it a few steps on.
  let sheetX: number = SHEET.start;
  let sheetClock = 1.2;
  let sheetYaw = 0.5;
  let blown = false;

  function takeOff(bird: Bird, to: Vector3, span: number, high: number, away: boolean): void {
    bird.flight = { from: bird.at.clone(), to, t: 0, span, high, away };
  }

  function update(delta: number): boolean {
    if (gone) return false;
    clock += delta;

    // Now and then the two of one patch flutter a few steps on: low and short, so no bird crosses in front of the three people.
    if (!leaving && clock >= nextFlight) {
      nextFlight = clock + 4.2 + (round % 3) * 1.1;
      let flown = 0;
      for (let i = round % PATCHES.length; i < BIRDS; i += PATCHES.length) {
        const bird = birds[i];
        if (bird.flight != null) continue;
        takeOff(bird, spot(bird.patch, i + round * 3 + 1, new Vector3()), 1.05 + (i % 2) * 0.2, 0.3, false);
        flown += 1;
      }
      round += 1;
      if (flown > 0) flap(flown);
    }

    let inSight = 0;
    for (let i = 0; i < BIRDS; i += 1) {
      const bird = birds[i];
      let pitch = 0;
      let beat = -1;
      const flight = bird.flight;
      if (flight != null) {
        flight.t += delta;
        const u = Math.min(1, flight.t / flight.span);
        const e = smooth(u);
        bird.at.lerpVectors(flight.from, flight.to, e);
        // A low arc to the next patch, or up and away for good.
        bird.at.y = flight.away ? flight.from.y + (flight.to.y - flight.from.y) * u * u + Math.sin(u * Math.PI) * 0.4 : floor + Math.sin(u * Math.PI) * flight.high;
        bird.yaw = Math.atan2(flight.to.x - flight.from.x, flight.to.z - flight.from.z);
        pitch = flight.away ? -0.35 : -0.4 * Math.cos(u * Math.PI);
        beat = Math.sin(clock * Math.PI * 2 * 7.5 + i) * 1.05 + 0.25;
        if (u >= 1) {
          if (flight.away) {
            bird.flight = null;
            bodies.setMatrixAt(i, none);
            wings.setMatrixAt(i * 2, none);
            wings.setMatrixAt(i * 2 + 1, none);
            bird.at.y = Infinity;
            continue;
          }
          bird.flight = null;
          bird.home.copy(flight.to);
          bird.at.copy(flight.to);
        }
      } else if (bird.at.y === Infinity) {
        continue;
      } else {
        // On the ground: a few pecks, a few steps, a look round.
        const mood = Math.sin(clock * 0.7 + bird.phase * 6.3);
        if (mood > 0.45) {
          pitch = Math.abs(Math.sin(clock * 7.5 + bird.phase * 9)) * 0.7 * smooth(Math.min(1, (mood - 0.45) / 0.2));
        } else if (mood < -0.25) {
          const dx = bird.home.x - bird.at.x;
          const dz = bird.home.z - bird.at.z;
          // Wandering, but turning back toward its patch once it has strayed.
          const want = dx * dx + dz * dz > 0.3 ? Math.atan2(dx, dz) : bird.yaw + Math.sin(clock * 0.9 + bird.phase * 20) * 1.5;
          bird.yaw += Math.atan2(Math.sin(want - bird.yaw), Math.cos(want - bird.yaw)) * Math.min(1, delta * 2.5);
          bird.at.x += Math.sin(bird.yaw) * 0.16 * delta;
          bird.at.z += Math.cos(bird.yaw) * 0.16 * delta;
          pitch = Math.sin(clock * 15 + bird.phase * 9) * 0.07;
        } else {
          bird.yaw += Math.sin(clock * 0.5 + bird.phase * 30) * 0.5 * delta;
        }
      }
      inSight += 1;
      tilt.set(pitch, bird.yaw, 0);
      turn.setFromEuler(tilt);
      put.compose(bird.at, turn, one);
      bodies.setMatrixAt(i, put);
      if (beat === -1) {
        wings.setMatrixAt(i * 2, none);
        wings.setMatrixAt(i * 2 + 1, none);
      } else {
        // The right wing as made; the left one turned round to the other side.
        flapTurn.setFromAxisAngle(Z, beat);
        local.compose(shoulder.set(0.04, 0.14, 0.01), flapTurn, one);
        wings.setMatrixAt(i * 2, wing.multiplyMatrices(put, local));
        flapTurn.setFromAxisAngle(Z, -beat).multiply(about);
        local.compose(shoulder.set(-0.04, 0.14, 0.01), flapTurn, one);
        wings.setMatrixAt(i * 2 + 1, wing.multiplyMatrices(put, local));
      }
    }
    bodies.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;

    if (sheet.visible) {
      sheetClock += delta;
      if (!blown && sheetClock >= SHEET.rest) {
        blown = true;
        sheetClock = 0;
      }
      if (blown) {
        const u = Math.min(1, sheetClock / SHEET.gust);
        const e = smooth(u);
        // Lifted, turned once over and set down a few steps on.
        sheet.position.set(sheetX + SHEET.step * e, floor + 0.012 + Math.sin(u * Math.PI) * 0.3, SHEET.z + Math.sin((sheetX + SHEET.step * e) * 0.5) * 0.35);
        sheet.rotation.set(-Math.PI / 2 + Math.PI * 2 * e, sheetYaw + 0.8 * e, Math.sin(u * Math.PI) * 0.35);
        if (u >= 1) {
          blown = false;
          sheetClock = 0;
          sheetX += SHEET.step;
          sheetYaw += 0.8;
          // Past the far end it comes in again from the near one, both out at the edges of the square.
          if (sheetX > SHEET.to) sheetX = SHEET.from;
        }
      } else {
        // Lying on the paving, a corner lifting in the wind.
        sheet.position.set(sheetX, floor + 0.012, SHEET.z + Math.sin(sheetX * 0.5) * 0.35);
        sheet.rotation.set(-Math.PI / 2 + Math.max(0, Math.sin(clock * 6.1)) * 0.05, sheetYaw, Math.sin(clock * 4.3) * 0.03);
      }
    }

    if (leaving && inSight === 0) {
      gone = true;
      for (const thing of things) thing.visible = false;
      return false;
    }
    return true;
  }

  // In place from the first frame.
  update(0);

  return {
    update,
    things,
    scatter: () => {
      if (leaving) return;
      leaving = true;
      sheet.visible = false;
      let flown = 0;
      for (let i = 0; i < BIRDS; i += 1) {
        const bird = birds[i];
        // Out over the roofs to either side of the bank, one after another.
        const to = new Vector3(bird.at.x + (i % 2 === 0 ? -10 - i : 9 + i), floor + 12 + i * 0.6, bird.at.z - 9 - i * 1.5);
        takeOff(bird, to, 2.6 + i * 0.22, 0, true);
        flown += 1;
      }
      flap(flown);
    },
  };
}
