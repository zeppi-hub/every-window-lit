import { createComponent, Types } from '@iwsdk/core';

export const PathKindEnum = { Slide: 'slide', Swing: 'swing' } as const;

/**
 * Hold and carry along a path (META_VR_V2_TASARIM.md, "Kontroller"): a
 * pump's lever, a rope, a bucket's bail, an oar. Taken by a hand's pinch
 * near its grip, a controller's trigger or squeeze near it, or a pinch or
 * trigger with the ray on it from afar (the emulator's Pinch button is a
 * hand's pinch); while held it follows its controller along the path, never
 * off it. The scene reads `progress`, `held` and `strokes`.
 * PathHandleSystem (v2/path-handle-system.ts) drives it.
 */
export const PathHandle = createComponent('PathHandle', {
  kind: { type: Types.Enum, enum: PathKindEnum, default: PathKindEnum.Slide },
  /** Slide: where the handle is at progress 0; swing: the pivot (parent space, m). */
  a: { type: Types.Vec3, default: [0, 0, 0] },
  /** Slide: where it is at progress 1 (parent space, m). */
  b: { type: Types.Vec3, default: [0, -0.2, 0] },
  /** Swing: the axis it turns about (parent space), and its angles at progress 0 and 1 (radians). */
  axis: { type: Types.Vec3, default: [1, 0, 0] },
  from: { type: Types.Float32, default: 0 },
  to: { type: Types.Float32, default: -1 },
  /** Where it is taken, in its own frame (its ring sits there, m). */
  grip: { type: Types.Vec3, default: [0, 0, 0] },
  /** How near a hand's pinch point must come to the grip to take it (m); a controller's grip gets a little more. */
  reach: { type: Types.Float32, default: 0.05 },
  /** Where along the path it is, 0 to 1 (by length). */
  progress: { type: Types.Float32, default: 0 },
  /** Let go, it eases back to this progress at `returnSpeed` per second; below 0 it stays. */
  rest: { type: Types.Float32, default: -1 },
  returnSpeed: { type: Types.Float32, default: 2 },
  held: { type: Types.Boolean, default: false },
  /** Who holds it ('left', 'right' or '') and how ('near', 'ray' or ''). */
  holder: { type: Types.String, default: '' },
  via: { type: Types.String, default: '' },
  /** Full strokes, end to end and back (a pump's strokes, a bucket's bails). */
  strokes: { type: Types.Int32, default: 0 },
});

/**
 * A memory held in someone's palm: a little orb with its world turning
 * inside. Taken (it needs a grab of its own, OneHandGrabbable) and held up
 * to the face, it grows round the head and the memory opens
 * (MemoryPortalSystem, v2/portal.ts).
 */
export const MemoryOrb = createComponent('MemoryOrb', {
  /** Which memory it opens (sent with memoryEnter). */
  memory: { type: Types.String, default: '' },
  /** How near the face it must come, held, to open (m). */
  enterDistance: { type: Types.Float32, default: 0.2 },
});

/**
 * A root of the world that shakes in a quake (a ship's deck, the forest,
 * the mountain): put it on the scene's top-level groups of a scene, never
 * on the player. QuakeSystem turns it round the player's eye and moves it a
 * little, `weight` times the quake's size, and puts it back after.
 */
export const Shakeable = createComponent('Shakeable', {
  weight: { type: Types.Float32, default: 1 },
});
