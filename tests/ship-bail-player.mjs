// A player as a clock for the bailing rules' tests (tests/ship-bail.test.mjs).
import * as b from '../src/v2/ship-bail.ts';

export const DT = 1 / 60;

/**
 * A player as a clock, not a person: plunge, lift, heave, come back, every
 * `cycle` seconds; shove the cover shut when it has slid past `lidAt`
 * (null: never touches it), which costs `shove` seconds of not bailing;
 * hold the cover down for a wave seen coming if `holdWaves`. The hand never
 * goes lower than `deepest` (from the eye), and stops `short` of putting the
 * rim under. Returns how the stage ended.
 */
export function play(rules, stage, { cycle = 2.4, heave = 2.0, lidAt = 0.35, shove = 0.9, holdWaves = true, deepest = -0.56, short = 0, losses = 0, limit = 150 } = {}) {
  const eased = b.ease(rules, losses);
  const hold = b.newHold(stage);
  const bucket = { fill: 0, peak: 0 };
  const step = { coming: false, hit: 0, lost: false, won: false };
  const thrown = { out: 0, back: 0, speed: 0 };
  let phase = 'dip';
  let left = 0.7;
  let lidHeld = false;
  let buckets = 0;
  for (let t = 0; t < limit; t += DT) {
    let hand = rules.brim + rules.bottom + 0.02;
    let speed = 0;
    if (phase === 'dip') hand = Math.max(deepest, b.surface(rules, hold.level) + rules.rim - 0.03 + short);
    else if (phase === 'lift') speed = 0.3;
    else if (phase === 'heave') speed = heave;
    const did = b.stepBucket(rules, bucket, hold, hand, speed, DT, thrown);
    if (did != null && did.out > 0.5) buckets += 1;
    b.stepHold(hold, stage, DT, eased * b.slack(rules, hold.clock), lidHeld, step);
    if (step.lost) return { result: 'lost', t, buckets, hold };
    if (step.won) return { result: 'won', t, buckets, hold };
    left -= DT;
    if (left > 0) continue;
    if (phase === 'dip') [phase, left] = ['lift', 0.3];
    else if (phase === 'lift') [phase, left] = ['heave', 0.15];
    else if (phase === 'heave') {
      // Between buckets: a wave coming, or a cover gone too far, takes the hands first.
      const wave = holdWaves && stage.lidGain > 0 && hold.waveIn <= stage.waveWarning;
      if (wave) [phase, left] = ['hold', hold.waveIn + 0.2];
      else if (lidAt != null && stage.lidGain > 0 && hold.lid > lidAt) [phase, left] = ['shove', shove];
      else [phase, left] = ['back', Math.max(0.1, cycle - 1.15)];
      if (phase !== 'back') lidHeld = true;
    } else {
      if (phase === 'shove' || phase === 'hold') {
        b.shoveLid(hold, 0);
        lidHeld = false;
      }
      [phase, left] = ['dip', 0.7];
    }
    if (phase === 'hold') b.shoveLid(hold, 0);
  }
  return { result: 'still going', t: limit, buckets, hold };
}
