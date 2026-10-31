import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { HARBOUR_LIGHT } from './far-city.js';
import { PLAZA_Y } from './layout.js';

/**
 * The last night of the season (META_VR_FIKIR.md §10): strings of warm
 * bulbs hung across the square, from the lamp posts along the row to the
 * palazzo's front, lit when the Keeper lights the lamp on the last Sunday.
 * How many of the town's windows light up with them is the season's model's
 * (festivalLights): no ending has a loss.
 */

/** Where each string hangs from and to (x, height, z), sagging between. */
const STRINGS: ReadonlyArray<readonly [readonly [number, number, number], readonly [number, number, number]]> = [
  [[-17.5, 4.6, -24.6], [-6, 6.2, -2.2]],
  [[-6.2, 4.6, -24.6], [-1.5, 6.2, -2.2]],
  [[6.4, 4.6, -24.6], [2.5, 6.2, -2.2]],
  [[18.6, 4.6, -24.6], [7, 6.2, -2.2]],
  [[-17.5, 4.6, -24.6], [18.6, 4.6, -24.6]],
];
const BULBS_PER_STRING = 22;
const SAG = 1.4;
const COLOURS = [0xffd27a, 0xffb36b, 0xfff0c2, 0xff9e7a];

export function createFestival(): Group {
  const festival = new Group();
  festival.name = 'Festival';
  const count = STRINGS.length * BULBS_PER_STRING;
  const bulbs = new InstancedMesh(new IcosahedronGeometry(0.085, 1), new MeshBasicMaterial({ color: 0xffffff }), count);
  bulbs.name = 'FestivalBulbs';
  // The wire between bulbs: one thin rod per gap, ends included.
  const wire = new InstancedMesh(
    new CylinderGeometry(0.009, 0.009, 1, 4, 1, true),
    new MeshStandardMaterial({ color: 0x2b2622, roughness: 0.8 }),
    STRINGS.length * (BULBS_PER_STRING + 1),
  );
  wire.name = 'FestivalWire';
  const m = new Matrix4();
  const p = new Vector3();
  const last = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const mid = new Vector3();
  const dir = new Vector3();
  const size = new Vector3();
  const up = new Vector3(0, 1, 0);
  const turn = new Quaternion();
  const colour = new Color();
  let rod = 0;
  const link = (from: Vector3, to: Vector3) => {
    dir.subVectors(to, from);
    size.set(1, dir.length(), 1);
    turn.setFromUnitVectors(up, dir.normalize());
    wire.setMatrixAt(rod, m.compose(mid.addVectors(from, to).multiplyScalar(0.5), turn, size));
    rod += 1;
  };
  const at = (out: Vector3, t: number) => {
    out.lerpVectors(a, b, t);
    out.y -= SAG * 4 * t * (1 - t);
    return out;
  };
  STRINGS.forEach(([from, to], s) => {
    a.set(from[0], PLAZA_Y + from[1], from[2]);
    b.set(to[0], PLAZA_Y + to[1], to[2]);
    last.copy(a);
    for (let k = 0; k < BULBS_PER_STRING; k += 1) {
      at(p, (k + 0.5) / BULBS_PER_STRING);
      bulbs.setMatrixAt(s * BULBS_PER_STRING + k, m.makeTranslation(p.x, p.y, p.z));
      bulbs.setColorAt(s * BULBS_PER_STRING + k, colour.setHex(COLOURS[(k + s) % COLOURS.length]));
      link(last, p);
      last.copy(p);
    }
    link(last, b);
  });
  bulbs.computeBoundingSphere();
  wire.computeBoundingSphere();

  // A soft glow round every bulb, one draw call, and warm pools of light on the paving under the strings.
  const glowAt: number[] = [];
  const glowColour: number[] = [];
  const pool = new PlaneGeometry(1, 1);
  pool.rotateX(-Math.PI / 2);
  const poolMaterial = new MeshBasicMaterial({
    map: softDisc(),
    color: 0xffb060,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  const pools = new InstancedMesh(pool, poolMaterial, (STRINGS.length - 1) * 2 + 1);
  pools.name = 'FestivalPools';
  let poolIndex = 0;
  STRINGS.forEach(([from, to], s) => {
    a.set(from[0], PLAZA_Y + from[1], from[2]);
    b.set(to[0], PLAZA_Y + to[1], to[2]);
    for (let k = 0; k < BULBS_PER_STRING; k += 1) {
      at(p, (k + 0.5) / BULBS_PER_STRING);
      glowAt.push(p.x, p.y, p.z);
      colour.setHex(COLOURS[(k + s) % COLOURS.length]);
      glowColour.push(colour.r, colour.g, colour.b);
    }
    // The row's own string hangs over the sidewalk; the others cross the open square.
    if (s < STRINGS.length - 1) {
      for (const t of [0.35, 0.7]) {
        at(p, t);
        pools.setMatrixAt(poolIndex, m.compose(mid.set(p.x, PLAZA_Y + 0.03, p.z), turn.identity(), size.set(5.5, 1, 5.5)));
        poolIndex += 1;
      }
    }
  });
  // And round the fountain, where the town gathers.
  pools.setMatrixAt(poolIndex, m.compose(mid.set(4, PLAZA_Y + 0.03, -14), turn.identity(), size.set(8, 1, 8)));
  pools.computeBoundingSphere();
  const haloGeometry = new BufferGeometry();
  haloGeometry.setAttribute('position', new Float32BufferAttribute(glowAt, 3));
  haloGeometry.setAttribute('color', new Float32BufferAttribute(glowColour, 3));
  const halos = new Points(
    haloGeometry,
    new PointsMaterial({ map: softDisc(), size: 0.55, vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
  );
  halos.name = 'FestivalHalos';

  festival.add(bulbs, wire, halos, pools, harbourLight());
  festival.visible = false;
  return festival;
}

/** A soft round glow, bright in the middle. */
function softDisc(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 64, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The harbour light at the end of the breakwater, dark all season, lit on
 * the last night: a warm lantern and a slow beam sweeping the sea
 * (META_VR_FIKIR.md §13: the lighthouse's mystery comes down to this scene).
 * FestivalSystem turns the beam.
 */
function harbourLight(): Group {
  const light = new Group();
  light.name = 'HarbourLight';
  light.position.set(HARBOUR_LIGHT.x, HARBOUR_LIGHT.y, HARBOUR_LIGHT.z);
  const lantern = new Mesh(new CylinderGeometry(1.3, 1.3, 2.1, 12), new MeshBasicMaterial({ color: 0xffe2a0, fog: false }));
  lantern.name = 'HarbourLantern';
  const beamGeometry = new ConeGeometry(9, 90, 16, 1, true);
  // Pointing out along +x from the lantern, wide end away.
  beamGeometry.translate(0, -45, 0);
  beamGeometry.rotateZ(Math.PI / 2);
  const beam = new Mesh(
    beamGeometry,
    new MeshBasicMaterial({ map: beamTexture(), color: 0xffe6b0, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }),
  );
  beam.name = 'HarbourBeam';
  light.add(lantern, beam);
  return light;
}

/** Bright at the lantern, fading out along the beam (the cone's v runs along it). */
function beamTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const fade = g.createLinearGradient(0, 128, 0, 0);
    fade.addColorStop(0, 'rgba(255,255,255,0)');
    fade.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 8, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
