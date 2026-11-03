// The ghost hand's guiding rules (src/hint-rules.ts, as HintSystem applies them): when it guides, where it sets out
// from (within 30 degrees of straight ahead), how it steps aside for the Keeper's hand, and the help ladder.
// `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { Object3D, Vector3 } = await import('@iwsdk/core');
const { SEAT_EYE } = await import('../src/station/layout.ts');
const { faceSeat, LINE_SIZE, STEP_PLACES } = await import('../src/station/tocco.ts');
const { arrowSpot, captionSize, LINE_CANVAS, rowRoom } = await import('../src/station/caption.ts');
const { AWAY, BACK_SECONDS, CYCLE_SECONDS, ENTRY_YAW, entryStart, freshNear, GLIDE_SECONDS, guided, HELP_AFTER, HELP_SECONDS, ladder, LINE_LEAD, NEAR, nearFrame, POINT_AFTER, STALL_SECONDS, waitsForHisLines } = await import('../src/hint-rules.ts');
const { HELP, instructionLine } = await import('../src/season/lines.ts');
const { MIN_SECONDS } = await import('../src/line-queue.ts');
const { SEASON_OVER } = await import('../src/season/lines.ts');

const FRAME = 1 / 72;

function seen(p) {
  const dx = p.x - SEAT_EYE.x;
  const dz = SEAT_EYE.z - p.z;
  return { yaw: (Math.atan2(dx, dz) * 180) / Math.PI, pitch: (Math.atan2(p.y - SEAT_EYE.y, Math.hypot(dx, dz)) * 180) / Math.PI };
}

test('the hand guides in the first week and the first time a gesture is shown; from the second week the family box keeps its own timing', () => {
  assert.equal(guided(1, false, false), true);
  assert.equal(guided(1, true, false), true, 'the first week guides every step, even a gesture seen before (the latch to close)');
  assert.equal(guided(2, false, false), true, 'a gesture new to this session');
  assert.equal(guided(2, true, false), false, 'later showings wait for stillness, as before');
  // The first week's knock on the box comes with Tocco's line (Devir 1b item 14); later the knock and hook wait for
  // the family's line and the stillness (H1).
  assert.equal(guided(1, false, true), true);
  assert.equal(guided(1, true, true), true, 'a second visit in the first week guides the knock again');
  assert.equal(guided(2, false, true), false);
  assert.equal(guided(7, false, true), false);
});

test('it comes half a second after its line, glides in in 0.6 s and shows the gesture every 1.2 s: in view within 1 s of the step', () => {
  assert.equal(LINE_LEAD, 0.5);
  assert.equal(GLIDE_SECONDS, 0.6);
  assert.equal(CYCLE_SECONDS, 1.2);
  // HintSystem reads the panel one frame late (it runs before ToccoSystem): still well inside a second.
  assert.ok(LINE_LEAD + 2 * FRAME <= 1.0);
});

test('it steps aside the frame a hand comes within 15 cm, and comes back once the hand moves away or after 3 s there', () => {
  const s = freshNear({ away: false, awayFor: 0, again: false, farFor: 0 });
  assert.equal(nearFrame(s, 0.5, FRAME), true);
  assert.equal(nearFrame(s, 0.16, FRAME), true, 'between 15 and 18 cm, coming in: still shown');
  assert.equal(nearFrame(s, NEAR - 0.001, FRAME), false, 'within 15 cm: gone this frame');
  assert.equal(nearFrame(s, 0.17, FRAME), false, 'not back until 18 cm away');
  // Moved away: back once it has stayed away a quarter of a second (a hand passing by does not make it flicker).
  let away = 0;
  while (!nearFrame(s, AWAY + 0.001, FRAME)) away += FRAME;
  assert.ok(away >= BACK_SECONDS - FRAME && away <= BACK_SECONDS + FRAME, `back after ${away.toFixed(3)} s away`);
  // Near again and kept there without progress: back after 3 s, and it stays while the hand stays.
  let t = 0;
  let back = -1;
  while (t < 5) {
    const shows = nearFrame(s, 0.05, FRAME);
    t += FRAME;
    if (shows && back < 0 && t > FRAME) back = t;
  }
  assert.ok(back >= STALL_SECONDS && back < STALL_SECONDS + 2 * FRAME, `back after ${back.toFixed(3)} s`);
  assert.equal(nearFrame(s, 0.05, FRAME), true, 'shown again: it stays until the hand leaves');
  assert.equal(nearFrame(s, 0.5, FRAME), true, 'shown again and the hand leaves: it stays');
  assert.equal(nearFrame(s, 0.05, FRAME), false, 'and steps aside again when it comes back');
});

test('the help ladder: Tocco points at 8 s, his help line at 16 s for 5 s; the first week has one for each step that needs it', () => {
  assert.equal(ladder(0), 'none');
  assert.equal(ladder(POINT_AFTER - 0.01), 'none');
  assert.equal(ladder(POINT_AFTER), 'point');
  assert.equal(ladder(HELP_AFTER - 0.01), 'point');
  assert.equal(ladder(HELP_AFTER), 'help');
  assert.equal(POINT_AFTER, 8);
  assert.equal(HELP_AFTER, 16);
  assert.equal(HELP_SECONDS, 5);
  assert.ok(HELP_SECONDS > MIN_SECONDS);
  // Each help line says the step another way, not the instruction again.
  for (const [step, line] of Object.entries(HELP)) assert.notEqual(line, instructionLine(step, 1, 12), step);
});

test('it sets out from the arrow tip, pulled in to 30 degrees from straight ahead, same distance and height', () => {
  const out = { x: 0, y: 0, z: 0 };
  // 45 degrees to the right, 50 cm out.
  const tip = { x: Math.sin(Math.PI / 4) * 0.5, y: 0.9, z: -Math.cos(Math.PI / 4) * 0.5 };
  entryStart(tip, SEAT_EYE, out);
  assert.ok(Math.abs(seen(out).yaw - ENTRY_YAW) < 1e-9, `${seen(out).yaw}`);
  assert.ok(Math.abs(Math.hypot(out.x, out.z) - 0.5) < 1e-9 && out.y === 0.9);
  // Inside 30 degrees it stays where it is.
  const near = { x: -0.1, y: 0.95, z: -0.45 };
  entryStart(near, SEAT_EYE, out);
  assert.ok(Math.abs(out.x - near.x) < 1e-12 && Math.abs(out.z - near.z) < 1e-12);
});

test("for every instruction's arrow, one row or two, at either caption size, the hand's first frame is within 30 degrees and the reading band", (t) => {
  for (const large of [false, true]) {
    const size = captionSize(large);
    for (const [step, { at, arrow }] of Object.entries(STEP_PLACES)) {
      const line = new Object3D();
      faceSeat(line, at);
      line.updateMatrixWorld(true);
      for (const rows of [1, 2]) {
        for (const widest of [200, rowRoom(size, true)]) {
          const spot = arrowSpot(rows, widest, size, arrow, LINE_CANVAS);
          const tip = line.localToWorld(new Vector3((spot.tipX / LINE_CANVAS.w - 0.5) * LINE_SIZE.w, (0.5 - spot.tipY / LINE_CANVAS.h) * LINE_SIZE.h, 0));
          const from = entryStart(tip, SEAT_EYE, { x: 0, y: 0, z: 0 });
          const { yaw, pitch } = seen(from);
          assert.ok(Math.abs(yaw) <= ENTRY_YAW + 1e-9, `${step}: ${yaw.toFixed(1)} across`);
          assert.ok(pitch <= 20 && pitch >= -35, `${step}: ${pitch.toFixed(1)} up`);
          if (!large && rows === 2 && widest > 200) t.diagnostic(`${step}: arrow tip at ${seen(tip).yaw.toFixed(1)} across, the hand sets out at ${yaw.toFixed(1)}, ${pitch.toFixed(1)} up`);
        }
      }
    }
  }
});

test("after the season's last week, the closed room's hand and ladder wait for his farewell", () => {
  // Only a step not yet begun, only in the closed room, only while lines of his wait.
  assert.equal(waitsForHisLines('shut', false, true), true);
  assert.equal(waitsForHisLines('shut', false, false), false);
  assert.equal(waitsForHisLines('shut', true, true), false);
  for (const phase of ['morning', 'bell', 'choosing', 'landed', 'days', 'sunday']) assert.equal(waitsForHisLines(phase, false, true), false, phase);
  // The farewell as ToccoSystem says it: the week done, last week's call settled, the notches, then the season's
  // end, each up MIN_SECONDS before the next; the latch's instruction once the last has been read. The ladder counts
  // only from when no line waits, so neither his pointing nor his help line comes while a farewell line is up.
  const farewell = 4;
  const lastUp = (farewell - 1) * MIN_SECONDS;
  const instructionUp = lastUp + MIN_SECONDS;
  let stuck = 0;
  let pointedAt = -1;
  let helpedAt = -1;
  for (let t = 0; t < 40; t += FRAME) {
    if (waitsForHisLines('shut', false, t < lastUp)) continue;
    stuck += FRAME;
    const rung = ladder(stuck);
    if (rung !== 'none' && pointedAt < 0) pointedAt = t;
    if (rung === 'help' && helpedAt < 0) helpedAt = t;
  }
  assert.ok(pointedAt >= instructionUp, `he points at ${pointedAt.toFixed(1)} s, the last farewell line (${JSON.stringify(SEASON_OVER)}) read at ${instructionUp} s`);
  assert.ok(helpedAt >= instructionUp + HELP_SECONDS, `his help line at ${helpedAt.toFixed(1)} s`);
});
