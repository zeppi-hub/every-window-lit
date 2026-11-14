import { createComponent, defineComponents, Types } from '@iwsdk/core';

export const Axis = { X: 'x', Y: 'y', Z: 'z' } as const;

/**
 * A handle that slides along one local axis when grabbed (latch, rope,
 * sun slider). Crossing `threshold` metres from rest fires `signal` once;
 * on release the handle springs back to `rest`. A quick tap that barely
 * moves it fires the signal too, which is the hands-only poke fallback.
 */
export const PullHandle = createComponent('PullHandle', {
  axis: { type: Types.Enum, default: Axis.X, enum: Axis },
  /** Signed travel in metres; the sign picks the pull direction. */
  travel: { type: Types.Float32, default: 0.1 },
  threshold: { type: Types.Float32, default: 0.07 },
  signal: { type: Types.String, default: '' },
  rest: { type: Types.Vec3, default: [0, 0, 0] },
  fired: { type: Types.Boolean, default: false },
  returning: { type: Types.Boolean, default: false },
  /** Seconds the current hold has lasted, and its furthest pull so far. */
  heldFor: { type: Types.Float32, default: 0 },
  maxPull: { type: Types.Float32, default: 0 },
  /** Seconds left before a tap fires; 0 when no tap is waiting. */
  tapTimer: { type: Types.Float32, default: 0 },
  /** How far a hold may move it and still be a tap (m): tap-gate.ts HANDLE_TAP_TRAVEL, the latch's LATCH_TAP_TRAVEL. */
  tapTravel: { type: Types.Float32, default: 0.015 },
  /** Its tap waits out a brush (the brake's knob): a press or a grab elsewhere before it fires, and it was the hand passing. */
  waits: { type: Types.Boolean, default: false },
});

/** A pokeable control: a fingertip press fires `signal`. */
export const PokeButton = createComponent('PokeButton', {
  signal: { type: Types.String, default: '' },
  /** Fires only once the touch has ended and a short wait passed with nothing else taken or pressed (tap-gate.ts). */
  waits: { type: Types.Boolean, default: false },
});

export const Side = { Left: 'left', Right: 'right' } as const;

/** One leaf of the window shutters, hinged on its outer edge. */
export const ShutterLeaf = createComponent('ShutterLeaf', {
  side: { type: Types.Enum, default: Side.Left, enum: Side },
  /** 0 closed, 1 fully open against the facade. */
  open: { type: Types.Float32, default: 0 },
  target: { type: Types.Float32, default: 0 },
});

/**
 * Where the week stands. Each session is one week: the shutters open on a
 * morning, the bell rings below, a pull on the rope brings the basket
 * up, one of three neighbourly objects (or nothing) goes into it, and the
 * brake lever lowers it back to the square. Then the brass sun on the
 * sill is slid from Monday to Sunday, each stop an evening, and closing the
 * shutters on Sunday ends the week. Lives on the basket entity.
 */
export const Phase = {
  Shut: 'shut',
  Morning: 'morning',
  Bell: 'bell',
  Rising: 'rising',
  Choosing: 'choosing',
  Lowering: 'lowering',
  Landed: 'landed',
  /** The sun is between Monday and Saturday. */
  Days: 'days',
  Sunday: 'sunday',
} as const;

export const Week = createComponent('Week', {
  phase: { type: Types.Enum, default: Phase.Shut, enum: Phase },
  week: { type: Types.Int16, default: 1 },
  /** Rope pulls so far this morning, 0 to 3. */
  pulls: { type: Types.Int8, default: 0 },
  /** Index of the object in the basket, -1 for none. */
  chosen: { type: Types.Int8, default: -1 },
  /** Evening of the week the sun stands on, 0 Monday to 6 Sunday; -1 before the week starts. */
  day: { type: Types.Int8, default: -1 },
  /** The Keeper's Sunday call on next week's prices: -1 none, 0 down, 1 up. */
  forecast: { type: Types.Int8, default: -1 },
  /** The Sunday lamp on the sill is lit. */
  lamp: { type: Types.Boolean, default: false },
  shuttersOpen: { type: Types.Boolean, default: false },
  /** Seconds spent in the current phase. */
  timer: { type: Types.Float32, default: 0 },
});

/**
 * One of the three objects on the sill. Grab it and drop it over the
 * basket, or tap it, to put it in; tap it again, or drop it anywhere else,
 * to send it home. `home` is captured when it is created.
 */
export const Choice = createComponent('Choice', {
  index: { type: Types.Int8, default: 0 },
  home: { type: Types.Vec3, default: [0, 0, 0] },
});

/**
 * The brass sun on its rail along the sill: slid (or tapped) through the
 * week's seven evenings. Seven stops from `x0` to `x1`.
 */
export const SunDial = createComponent('SunDial', {
  x0: { type: Types.Float32, default: 0 },
  x1: { type: Types.Float32, default: 0.3 },
});

/** The brass spyglass on the sill: lifted to the eye, it shows the town about twice as near (SpyglassSystem). */
export const Spyglass = createComponent('Spyglass', {});

/** The loose glass globe: it comes up in a basket, and goes in the lamp by hand (GlobeSystem). */
export const Globe = createComponent('Globe', {});

/** Lina's folded drawing, in the turning-point week (DrawingSystem). */
export const Drawing = createComponent('Drawing', {});

export default defineComponents([PullHandle, PokeButton, ShutterLeaf, Week, Choice, SunDial, Spyglass, Globe, Drawing]);
