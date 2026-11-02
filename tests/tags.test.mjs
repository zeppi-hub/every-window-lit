// The tags over the sill's three things and the coin dots over the jar (src/station/tags.ts), seen from the seated
// eye: each tag stands just over its thing and clear of the things, of each other, of Tocco's line beside him (where
// the choosing instruction hangs) and of the basket and its card; its word's capitals are at least 1.2 degrees tall;
// each tag carries as many coin dots as its thing costs; and the whole of it is one draw. `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Box3, Object3D, Vector3 } = await import('@iwsdk/core');
const { BASKET_ON_SILL, CARD_IN_BASKET, SEAT_EYE, SILL } = await import('../src/station/layout.ts');
const { CHOICE_HOMES, createBasket } = await import('../src/station/basket.ts');
const { createOptions } = await import('../src/station/options.ts');
const { createCard, JAR_POSITION } = await import('../src/station/card.ts');
const { createMaquette } = await import('../src/station/maquette.ts');
const { faceSeat, LINE_HOME, LINE_SIZE, STEP_PLACES } = await import('../src/station/tocco.ts');
const { bandOf, captionSize, LINE_CANVAS } = await import('../src/station/caption.ts');
const { createTags, DOT_ROW, drawTags, placeDot, TAG_CANVAS, TAG_CELL, TAG_LARGE, TAG_TUCK, TAG_QUADS, tagCap, tagPlace, layoutTags, thingReach } = await import('../src/station/tags.ts');
const { COST } = await import('../src/season/model.ts');
const { TAGS } = await import('../src/season/lines.ts');

const SIZES = [
  ['normal', false],
  ['larger', true],
];

/** Degrees right of and above straight ahead, from the seated eye. */
function seen(p) {
  const dx = p.x - SEAT_EYE.x;
  const dz = SEAT_EYE.z - p.z;
  return { yaw: (Math.atan2(dx, dz) * 180) / Math.PI, pitch: (Math.atan2(p.y - SEAT_EYE.y, Math.hypot(dx, dz)) * 180) / Math.PI };
}

/** A box of directions (degrees) round a set of world points. */
function boxOf(points) {
  const out = { left: Infinity, right: -Infinity, top: -Infinity, foot: Infinity };
  for (const p of points) {
    const { yaw, pitch } = seen(p);
    out.left = Math.min(out.left, yaw);
    out.right = Math.max(out.right, yaw);
    out.top = Math.max(out.top, pitch);
    out.foot = Math.min(out.foot, pitch);
  }
  return out;
}

const EYE = new Vector3(SEAT_EYE.x, SEAT_EYE.y, SEAT_EYE.z);

/**
 * Degrees between what two sets of world points cover as seen from the eye (negative: they overlap). The points are
 * projected onto the plane square to the look halfway between the two sets (as a camera there would see them), so
 * things far down are not stretched sideways as yaw and pitch stretch them; there each set's outline (its convex
 * hull) is tested against the other's along every edge's normal, and the widest gap found is the answer.
 */
function apart(a, b) {
  const middle = (points) => points.reduce((sum, p) => sum.add(p.clone().sub(EYE).normalize()), new Vector3()).normalize();
  const look = middle(a).add(middle(b)).normalize();
  const right = new Vector3().crossVectors(look, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(right, look);
  const flat = (points) =>
    hull(
      points.map((p) => {
        const d = p.clone().sub(EYE).normalize();
        const along = d.dot(look);
        return [d.dot(right) / along, d.dot(up) / along];
      }),
    );
  const p = flat(a);
  const q = flat(b);
  let gap = -Infinity;
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i += 1) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % poly.length];
      const length = Math.hypot(x1 - x0, y1 - y0);
      if (length === 0) continue;
      const nx = (y1 - y0) / length;
      const ny = (x0 - x1) / length;
      const span = (polygon) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const [x, y] of polygon) {
          const t = x * nx + y * ny;
          lo = Math.min(lo, t);
          hi = Math.max(hi, t);
        }
        return [lo, hi];
      };
      const [alo, ahi] = span(p);
      const [blo, bhi] = span(q);
      gap = Math.max(gap, blo - ahi, alo - bhi);
    }
  }
  return (Math.atan(gap) * 180) / Math.PI;
}

/** The convex hull of 2D points (monotone chain), counter-clockwise. */
function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * What tag `i` shows, from its four corners: its word (the cell's middle 344 of 400 px across, rows 52 to 140 of 256:
 * capitals, and the tails of letters like y) and its coin dots (centred, rows 174 to 214), each as four corners.
 */
function shown(corners, i) {
  const [tl, tr, bl] = corners;
  const across = tr.clone().sub(tl);
  const down = bl.clone().sub(tl);
  const box = (x0, x1, y0, y1) =>
    [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ].map(([x, y]) => tl.clone().addScaledVector(across, x / 400).addScaledVector(down, y / 256));
  const dots = COST[i] * 40 + (COST[i] - 1) * 16;
  return [box(28, 372, 52, 140), box(200 - dots / 2, 200 + dots / 2, 174, 214)];
}

/** Quad `q` of the tags' mesh: its four corners (in world coordinates: the mesh stands at the origin). */
function quad(mesh, q) {
  const position = mesh.geometry.getAttribute('position');
  const points = [];
  for (let c = 0; c < 4; c += 1) points.push(new Vector3().fromBufferAttribute(position, 4 * q + c));
  return points;
}

/** A thing's points: every vertex of its meshes, in the world. */
function pointsOf(object) {
  object.updateMatrixWorld(true);
  const points = [];
  object.traverse((o) => {
    const position = o.geometry?.attributes?.position;
    if (position == null) return;
    for (let i = 0; i < position.count; i += 1) points.push(new Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld));
  });
  return points;
}

/** The corners and edge middles of the widest band of Tocco's line at `place`, `rows` rows, at either size. */
function bandPoints(place, rows, large) {
  const metresPerPx = LINE_SIZE.h / LINE_CANVAS.h;
  const band = bandOf(rows, LINE_CANVAS.w, captionSize(large));
  const home = new Object3D();
  faceSeat(home, place);
  const points = [];
  for (const sx of [-1, -0.5, 0, 0.5, 1]) {
    for (const sy of [-1, 1]) {
      points.push(new Vector3((sx * band.w * metresPerPx) / 2, (band.lift + (sy * band.h) / 2) * metresPerPx, 0).applyQuaternion(home.quaternion).add(home.position));
    }
  }
  return points;
}

const KINDS = ['fuel', 'power', 'food'];

/** How tall each of a kind's three things stands, and how far back it reaches (SeasonSystem lays the tags out by the week's). */
function reachOf(kind) {
  return createOptions()[kind].map((mesh) => thingReach(mesh.geometry, mesh.rotation.y));
}

/** The tags' mesh laid out over a kind's things at a size, with the jar's dots for a balance of `coins`. */
function tagsAt(kind, large, coins = 5) {
  const { mesh } = createTags(TAGS, [0, 1, 2].map((i) => COST[i]));
  const reach = reachOf(kind);
  layoutTags(
    mesh.geometry,
    large,
    reach.map((r) => r.top),
    reach.map((r) => r.back),
  );
  for (let k = 0; k < coins; k += 1) placeDot(mesh.geometry, k, coins, 0);
  return mesh;
}

/** The week's three things of each kind, at their homes on the sill. */
function thingsOf(kind) {
  return createOptions()[kind].map((mesh, i) => {
    const [x, y, z] = CHOICE_HOMES[i];
    mesh.position.set(x, y, z);
    return mesh;
  });
}

test('the tags and the jar dots are one mesh with one material: one draw, only while shown', () => {
  const { mesh } = createTags(TAGS, [0, 1, 2].map((i) => COST[i]));
  assert.equal(mesh.isMesh, true);
  assert.ok(!Array.isArray(mesh.material), 'one material');
  assert.equal(mesh.geometry.groups.length, 0, 'no groups');
  assert.equal(mesh.children.length, 0);
  assert.equal(mesh.visible, false, 'hidden until the choice');
  assert.equal(mesh.geometry.index.count, TAG_QUADS * 6);
  assert.equal(TAG_QUADS, 3 + 8, 'three tags and a dot for each coin the jar can hold');
});

test("each tag carries one coin dot for each coin its thing costs (3, 1, 2), and its word", () => {
  assert.deepEqual([0, 1, 2].map((i) => COST[i]), [3, 1, 2]);
  // A canvas that records what is drawn where.
  const arcs = [];
  const words = [];
  const g = new Proxy(
    {},
    {
      get(_, key) {
        if (key === 'arc') return (x, y) => arcs.push({ x, y });
        if (key === 'fillText') return (text, x, y, most) => words.push({ text, x, y, most });
        return typeof key === 'string' ? () => undefined : undefined;
      },
      set: () => true,
    },
  );
  const texture = { image: { width: TAG_CANVAS.w, height: TAG_CANVAS.h, getContext: () => g } };
  drawTags(texture, TAGS, [0, 1, 2].map((i) => COST[i]));
  const cells = [
    [0, 0],
    [400, 0],
    [0, 256],
  ];
  cells.forEach(([x, y], i) => {
    const inside = (p) => p.x >= x && p.x < x + TAG_CELL.w && p.y >= y && p.y < y + TAG_CELL.h;
    assert.equal(arcs.filter(inside).length, COST[i], `${TAGS[i]}: coin dots`);
    const word = words.filter(inside);
    assert.equal(word.length, 1);
    assert.equal(word[0].text, TAGS[i]);
    assert.ok(word[0].most <= TAG_CELL.w - 40, 'the word kept inside its tag');
  });
  // The jar's own coin, once, outside the three cells.
  assert.equal(arcs.length, 3 + 1 + 2 + 1);
});

test("each tag's capitals stand at least 1.2 degrees tall from the seat, larger with Larger captions", (t) => {
  const capSeen = (p) => {
    const distance = Math.hypot(p.x - SEAT_EYE.x, p.y - SEAT_EYE.y, p.z - SEAT_EYE.z);
    return { degrees: (2 * Math.atan(tagCap(p.h) / 2 / distance) * 180) / Math.PI, distance };
  };
  for (const kind of KINDS) {
    const reach = reachOf(kind);
    for (let i = 0; i < 3; i += 1) {
      const normal = capSeen(tagPlace(i, reach[i].top, reach[i].back, false));
      const larger = capSeen(tagPlace(i, reach[i].top, reach[i].back, true));
      assert.ok(normal.degrees >= 1.2, `${kind} ${TAGS[i]}: capitals ${normal.degrees.toFixed(2)} degrees at ${normal.distance.toFixed(2)} m`);
      assert.ok(larger.degrees > normal.degrees);
      if (kind === 'fuel') t.diagnostic(`${TAGS[i]} (fuel week): capitals ${normal.degrees.toFixed(2)} degrees (${(tagCap(tagPlace(i, reach[i].top, reach[i].back, false).h) * 1000).toFixed(1)} mm) at ${normal.distance.toFixed(2)} m, ${larger.degrees.toFixed(2)} larger`);
    }
  }
  assert.ok(Math.abs(TAG_LARGE - 68 / 52) < 1e-9);
});

test('each tag stands just over its own thing, of every kind of week, clear of the things at either size', (t) => {
  for (const [name, large] of SIZES) {
    for (const kind of KINDS) {
      const mesh = tagsAt(kind, large);
      const things = thingsOf(kind);
      const reach = reachOf(kind);
      for (let i = 0; i < 3; i += 1) {
        // Just behind its thing's place, its foot just above the thing's top.
        const at = tagPlace(i, reach[i].top, reach[i].back, large);
        assert.ok(Math.abs(at.x - CHOICE_HOMES[i][0]) <= 0.041, `${kind} ${TAGS[i]}: ${(at.x - CHOICE_HOMES[i][0]).toFixed(3)} m to the side of its thing`);
        assert.ok(at.z < CHOICE_HOMES[i][2] && at.z > CHOICE_HOMES[i][2] - 0.1, `${kind} ${TAGS[i]}: ${(CHOICE_HOMES[i][2] - at.z).toFixed(3)} m behind its thing`);
        const top = reach[i].top;
        const foot = Math.min(...quad(mesh, i).map((p) => p.y));
        // (It leans back to face the seat, so its foot stands a little higher than where it starts.)
        assert.ok(foot >= SILL.top + top - TAG_TUCK * at.h - 1e-6 && foot <= SILL.top + top + 0.01, `${name} ${kind} ${TAGS[i]}: foot ${(foot - SILL.top).toFixed(3)} over the sill, thing ${top.toFixed(3)}`);
        // No thing hides a tag's word or dots (a tag stands behind its thing, which is drawn over it).
        for (let j = 0; j < 3; j += 1) {
          const gap = Math.min(...shown(quad(mesh, i), i).map((part) => apart(part, pointsOf(things[j]))));
          assert.ok(gap > 0, `${name} ${kind}: the thing ${j + 1} over the word of ${TAGS[i]} (${gap.toFixed(2)} degrees apart)`);
          if (i === j && name === 'normal') t.diagnostic(`${kind} ${TAGS[i]}: its word and dots ${gap.toFixed(1)} degrees over its thing`);
        }
      }
    }
    const mesh = tagsAt('fuel', large);
    for (let i = 0; i < 3; i += 1) {
      const tag = boxOf(quad(mesh, i));
      t.diagnostic(`${name} ${TAGS[i]} (fuel week): ${tag.left.toFixed(1)} to ${tag.right.toFixed(1)} across, ${tag.foot.toFixed(1)} to ${tag.top.toFixed(1)} up`);
    }
  }
});

test("the tags keep clear of each other, of Tocco's line beside him, of the basket and its card, and of the jar", (t) => {
  // The choosing instruction hangs beside him (station/tocco.ts STEP_PLACES).
  assert.equal(STEP_PLACES.choosing.at, LINE_HOME);
  const basket = createBasket().basket;
  basket.position.set(BASKET_ON_SILL.x, BASKET_ON_SILL.y, BASKET_ON_SILL.z);
  const parts = createCard();
  const card = parts.card;
  card.position.set(BASKET_ON_SILL.x + CARD_IN_BASKET.x, BASKET_ON_SILL.y + CARD_IN_BASKET.y, BASKET_ON_SILL.z + CARD_IN_BASKET.z);
  card.rotation.set(CARD_IN_BASKET.tilt, CARD_IN_BASKET.yaw, 0, 'YXZ');
  const things = { 'the basket on the sill': pointsOf(basket), 'the card in the basket': pointsOf(card), 'the jar': pointsOf(parts.jar) };
  const maquette = createMaquette();
  const model = new Object3D();
  model.add(maquette.group, maquette.house);
  const modelPoints = pointsOf(model);
  for (const [name, large] of SIZES) {
    for (const kind of KINDS) {
      const mesh = tagsAt(kind, large, 8);
      for (let i = 0; i < 3; i += 1) {
        for (let j = i + 1; j < 3; j += 1) {
          const gap = apart(quad(mesh, i), quad(mesh, j));
          assert.ok(gap > 0.5, `${name} ${kind}: ${TAGS[i]} and ${TAGS[j]} ${gap.toFixed(1)} degrees apart`);
        }
        // The first week (a fuel week) says its choice and its lever there in two rows; from the second week only the
        // choosing instruction hangs there while choosing, in one row (story lines then hang over the basket).
        for (const rows of [1, 2]) {
          const gap = apart(quad(mesh, i), bandPoints(LINE_HOME, rows, large));
          if (kind === 'fuel' || rows === 1) assert.ok(gap > 0.25, `${name} ${kind}, ${rows} rows: ${TAGS[i]} and his line ${gap.toFixed(1)} degrees apart`);
          if (rows === 2) t.diagnostic(`${name} ${kind}: ${TAGS[i]} and his widest two-row line beside him ${gap.toFixed(1)} degrees apart`);
        }
        for (const [thing, points] of Object.entries(things)) assert.ok(apart(quad(mesh, i), points) > 0.5, `${name} ${kind}: ${TAGS[i]} meets ${thing}`);
        // The little model is on the sill only from the landing in the first week; later weeks it stands behind the
        // middle thing while choosing, and a tag in front of it may hide a little of it: reported, not asserted.
        if (kind === 'food') t.diagnostic(`${name} ${kind}: ${TAGS[i]} and the little model ${apart(quad(mesh, i), modelPoints).toFixed(1)} degrees apart`);
      }
    }
    // The dots: over the jar, clear of its mouth, eight at most, clear of the basket and its card.
    const mesh = tagsAt('fuel', large, 8);
    const jarTop = Math.max(...things['the jar'].map((p) => p.y));
    for (let k = 0; k < 8; k += 1) {
      assert.ok(Math.min(...quad(mesh, 3 + k).map((p) => p.y)) > jarTop, `${name}: dot ${k + 1} over the jar's mouth`);
      for (const [thing, points] of Object.entries(things)) if (thing !== 'the jar') assert.ok(apart(quad(mesh, 3 + k), points) > 0.5, `${name}: dot ${k + 1} meets ${thing}`);
    }
    const row = boxOf([...quad(mesh, 3), ...quad(mesh, 10)]);
    t.diagnostic(`${name}: eight dots ${row.left.toFixed(1)} to ${row.right.toFixed(1)} across, ${row.foot.toFixed(1)} to ${row.top.toFixed(1)} up`);
  }
  const middle = seen(DOT_ROW);
  t.diagnostic(`the dots' row centre ${middle.yaw.toFixed(1)} across, ${middle.pitch.toFixed(1)} up; the jar at ${seen(JAR_POSITION).yaw.toFixed(1)} across`);
});

test('a dropped dot falls straight down from its place, and the row stays centred on the jar', () => {
  const { mesh } = createTags(TAGS, [3, 1, 2]);
  const position = mesh.geometry.getAttribute('position');
  placeDot(mesh.geometry, 4, 5, 0);
  const before = new Vector3().fromBufferAttribute(position, 4 * 7);
  placeDot(mesh.geometry, 4, 5, 0.05);
  const after = new Vector3().fromBufferAttribute(position, 4 * 7);
  assert.ok(Math.abs(before.y - after.y - 0.05) < 1e-6 && Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.z - after.z) < 1e-9);
  // Five dots: the middle one over the jar.
  placeDot(mesh.geometry, 2, 5, 0);
  const box = new Box3();
  for (let c = 0; c < 4; c += 1) box.expandByPoint(new Vector3().fromBufferAttribute(position, 4 * 5 + c));
  const centre = box.getCenter(new Vector3());
  assert.ok(Math.abs(centre.x - JAR_POSITION.x) < 0.002 && Math.abs(centre.z - JAR_POSITION.z) < 0.002, `${centre.x} ${centre.z}`);
  assert.ok(centre.y > SILL.top + 0.09, 'over the jar mouth');
});
