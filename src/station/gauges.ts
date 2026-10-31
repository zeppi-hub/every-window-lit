import { CanvasTexture, CircleGeometry, Group, Mesh, MeshBasicMaterial, SRGBColorSpace } from '@iwsdk/core';
import type { Kind } from '../season/model.js';
import { annulus, box, PartBuilder, prism, WORLD } from './facade.js';
import { SEAT_EYE, SILL } from './layout.js';
import { glowing } from './materials.js';

/**
 * Three small brass dials on the near edge of the sill (META_VR_DINAMIKLER.md
 * items 7 and 18): pumps, power and groceries, each with a picture instead
 * of a word. A needle shows how hard the week's prices press, from calm
 * (left) to steep (right); GaugeSystem swings the week's own dial each
 * morning, and the other two keep what they last showed.
 */
export const GAUGE_KINDS: readonly Kind[] = ['fuel', 'power', 'food'];
const GAUGE_X = [-0.42, -0.31, -0.2];
const GAUGE_Z = -0.19;
/** The dial's radius, and how far it leans back toward the Keeper. */
const RADIUS = 0.028;

export function createGauges(): Group {
  const group = new Group();
  group.name = 'Gauges';
  GAUGE_KINDS.forEach((kind, i) => {
    const dial = new Group();
    dial.name = `Gauge_${kind}`;
    dial.position.set(GAUGE_X[i], SILL.top + 0.006, GAUGE_Z);
    // Face the eye.
    dial.lookAt(SEAT_EYE.x, SEAT_EYE.y, SEAT_EYE.z);
    // A brass case behind the face and a raised rim round it (built along y, turned to face +z below).
    const b = new PartBuilder();
    b.color(0xc9a349);
    prism(b, WORLD, 0, 0, -0.008, 0, RADIUS + 0.005, RADIUS + 0.005, 24, { smooth: true });
    prism(b, WORLD, 0, 0, 0, 0.003, RADIUS + 0.005, RADIUS + 0.004, 24, { smooth: true });
    annulus(b, WORLD.at(0, 0.003, 0), 0, 0, 0, RADIUS, RADIUS + 0.004, 24, true);
    const bezel = b.mesh(glowing(0.35, 0.9), `GaugeBezel_${kind}`);
    // The prism stands along y; turn it so its top faces the dial's +z (toward the eye).
    bezel.rotation.x = Math.PI / 2;
    const face = new Mesh(new CircleGeometry(RADIUS, 28), new MeshBasicMaterial({ map: faceTexture(kind), color: 0xdddddd }));
    face.position.z = 0.0004;
    const needle = new Group();
    needle.name = `GaugeNeedle_${kind}`;
    const n = new PartBuilder();
    n.color(0x2a1d14);
    box(n, WORLD, -0.0012, -0.004, 0.0004, 0.0012, RADIUS * 0.82, 0.0014);
    n.color(0xb38e3a);
    prism(n, WORLD.at(0, 0, 0), 0, 0, 0, 0.0018, 0.003, 0.003, 10, { top: true });
    const needleMesh = n.mesh(glowing(0.5, 0.3), `GaugeNeedleMesh_${kind}`);
    needle.add(needleMesh);
    needle.position.z = 0.0008;
    dial.add(bezel, face, needle);
    group.add(dial);
  });
  return group;
}

/** The needle's angle (radians, clockwise from straight up) for a week's tier: -1 cheaper ... 3 much dearer. */
export function needleAngle(tier: number): number {
  return ((-120 + (tier + 1) * 60) * Math.PI) / 180;
}

/** A cream face with calm-to-steep bands round the top and the series' picture below. */
function faceTexture(kind: Kind): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g != null) {
    const c = size / 2;
    g.fillStyle = '#efe6d0';
    g.beginPath();
    g.arc(c, c, c, 0, Math.PI * 2);
    g.fill();
    // Bands from calm to steep, over the same sweep as the needle (-120° to +120° from the top).
    const bands = ['#7fa36a', '#a9b46a', '#d9b05a', '#d98a4a', '#c0583e'];
    bands.forEach((colour, k) => {
      const a0 = ((-120 + k * 48 - 90) * Math.PI) / 180;
      const a1 = ((-120 + (k + 1) * 48 - 90) * Math.PI) / 180;
      g.strokeStyle = colour;
      g.lineWidth = 12;
      g.beginPath();
      g.arc(c, c, c - 14, a0, a1);
      g.stroke();
    });
    g.fillStyle = '#3a2e24';
    for (let k = 0; k <= 10; k += 1) {
      const a = ((-120 + k * 24 - 90) * Math.PI) / 180;
      g.save();
      g.translate(c + Math.cos(a) * (c - 26), c + Math.sin(a) * (c - 26));
      g.rotate(a + Math.PI / 2);
      g.fillRect(-1.5, -4, 3, 8);
      g.restore();
    }
    // The picture: a pump, a bulb or a loaf, in brown.
    g.fillStyle = '#4a3a2c';
    g.strokeStyle = '#4a3a2c';
    g.lineWidth = 4;
    const y = c + 26;
    if (kind === 'fuel') {
      g.fillRect(c - 12, y - 16, 18, 30);
      g.fillStyle = '#efe6d0';
      g.fillRect(c - 8, y - 12, 10, 8);
      g.beginPath();
      g.moveTo(c + 6, y - 10);
      g.quadraticCurveTo(c + 18, y - 8, c + 14, y + 8);
      g.stroke();
    } else if (kind === 'power') {
      g.beginPath();
      g.arc(c, y - 6, 11, 0, Math.PI * 2);
      g.fill();
      g.fillRect(c - 6, y + 4, 12, 10);
    } else {
      g.beginPath();
      g.ellipse(c, y, 18, 11, 0, Math.PI, 0);
      g.lineTo(c + 18, y + 6);
      g.lineTo(c - 18, y + 6);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#3a2e24';
    g.beginPath();
    g.arc(c, c, 5, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
