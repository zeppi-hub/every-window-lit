import { type AnyComponent, ComponentRegistry, type Entity } from '@iwsdk/core';

/** IWSDK's grab handle on a grabbable (GrabSystem's internal Handle component): it reads its options on every pointer event. */
interface GrabHandle {
  getOptions: () => { filter?: (event: { pointerType: string }) => boolean };
}

/** Only a pinch (the grab pointer) or a ray may take hold; a fingertip only presses. */
const notTouch = (event: { pointerType: string }): boolean => event.pointerType !== 'touch';

let handleType: AnyComponent | null = null;
const done = new WeakSet<object>();

/**
 * A fingertip on this grabbable is a tap, never a hold (the three things on
 * the sill, ChoiceSystem; the brass sun, SunSystem). IWSDK lets a touch start
 * a grabbable's grab handle. On a free thing the handle then moves it with
 * the finger, so the fingertip never leaves the face it touched, the touch
 * never ends and the thing stays stuck to the finger (in the emulator three
 * pokes in four on the badge); on the sun the touch flickers as the finger
 * passes the disc, and one poke made two short holds, two taps: Monday and
 * Sunday at once. The handle now ignores the touch pointer: the touch still
 * presses the thing (Pressed), which taps it once as the finger lifts, and
 * a pinch or a ray still takes hold. Cheap to call every frame: it does its
 * work once, after GrabSystem has given the entity its handle.
 */
export function tapOnlyByTouch(entity: Entity): void {
  handleType ??= ComponentRegistry.getById('Handle') ?? null;
  if (handleType == null || !entity.hasComponent(handleType)) return;
  const handle = entity.getValue(handleType, 'instance') as GrabHandle | undefined;
  if (handle == null || done.has(handle)) return;
  const options = handle.getOptions;
  handle.getOptions = () => {
    const made = options();
    made.filter = notTouch;
    return made;
  };
  done.add(handle);
}
