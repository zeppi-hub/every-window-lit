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
});

/** A pokeable control: a fingertip press fires `signal`. */
export const PokeButton = createComponent('PokeButton', {
  signal: { type: Types.String, default: '' },
});

export const Side = { Left: 'left', Right: 'right' } as const;

/** One leaf of the window shutters, hinged on its outer edge. */
export const ShutterLeaf = createComponent('ShutterLeaf', {
  side: { type: Types.Enum, default: Side.Left, enum: Side },
  /** 0 closed, 1 fully open against the facade. */
  open: { type: Types.Float32, default: 0 },
  target: { type: Types.Float32, default: 0 },
});

export default defineComponents([PullHandle, PokeButton, ShutterLeaf]);
