// A controller's trigger as its pinch (src/systems/controller-pinch.ts), beside the grip that presses the same grab
// pointer's button: `node --test tests/`.
import './station-hooks.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { ControllerPinchSystem } = await import('../src/systems/controller-pinch.ts');

/**
 * The right controller's grab pointer near something holdable, as @pmndrs/pointer-events and its handle treat it:
 * the first press of button 2 takes hold (later presses find it already held), and any release of button 2 lets go.
 * MultiPointer presses it on the grip's squeeze when the grab pointer is the active kind, and releases it with the
 * grip; ControllerPinchSystem routes the trigger to it. Returns a frame stepper and what is held.
 */
function controller(activeKind = 'grab') {
  const grab = {
    buttons: new Set(),
    held: false,
    getIntersection: () => ({ object: { name: 'FamilyRoom', isVoidObject: false } }),
    getButtonsDown() {
      return this.buttons;
    },
    down(button) {
      this.buttons.add(button);
      this.held = true;
    },
    up(button) {
      this.buttons.delete(button);
      this.held = false;
    },
  };
  let gripPressed = false;
  let gripPressedPointer = false;
  const pointer = {
    getActiveKind: () => activeKind,
    getPointer: () => grab,
    routeDown: (_kind, _target) => grab.down(2),
    routeUp: (_kind, _target) => grab.up(2),
  };
  const frame = { select: { start: false, end: false }, squeezeStart: false };
  const system = Object.create(ControllerPinchSystem.prototype);
  system.routed = { left: false, right: false };
  system.input = {
    xr: {
      multiPointers: { left: pointer, right: pointer },
      isPrimary: (kind, side) => kind === 'controller' && side === 'right',
      getSelectState: (side) => (side === 'right' ? frame.select : { start: false, end: false }),
      gamepads: { right: { getButtonDown: (id) => id === 'xr-standard-squeeze' && frame.squeezeStart } },
    },
  };
  /** One frame: the input manager's MultiPointer first, then the system, as in IWSDK. */
  const step = ({ trigger, grip } = {}) => {
    frame.select = { start: trigger === 'down', end: trigger === 'up' };
    frame.squeezeStart = grip === 'down';
    if (grip === 'down') {
      gripPressed = true;
      if (activeKind === 'grab') {
        gripPressedPointer = true;
        grab.down(2);
      }
    }
    if (grip === 'up' && gripPressed) {
      gripPressed = false;
      if (gripPressedPointer) grab.up(2);
      gripPressedPointer = false;
    }
    system.update(1 / 72, 0);
    return grab.held;
  };
  return step;
}

test('the trigger alone takes hold near something holdable and lets go on its release', () => {
  const step = controller();
  assert.equal(step({ trigger: 'down' }), true);
  assert.equal(step(), true);
  assert.equal(step({ trigger: 'up' }), false);
});

test('a trigger pressed and let go while the grip holds leaves the hold to the grip', () => {
  const step = controller();
  assert.equal(step({ grip: 'down' }), true);
  assert.equal(step({ trigger: 'down' }), true);
  assert.equal(step({ trigger: 'up' }), true, 'the trigger let go of what the grip holds');
  assert.equal(step(), true);
  assert.equal(step({ grip: 'up' }), false);
  // Both pressed in the same frame: the grip holds, and the trigger's release leaves it.
  assert.equal(step({ grip: 'down', trigger: 'down' }), true);
  assert.equal(step({ trigger: 'up' }), true);
  assert.equal(step({ grip: 'up' }), false);
});

test("a grip pressed during the trigger's hold takes it over: the trigger's release no longer drops it, the grip's does", () => {
  const step = controller();
  assert.equal(step({ trigger: 'down' }), true);
  assert.equal(step({ grip: 'down' }), true);
  assert.equal(step({ trigger: 'up' }), true, "the trigger's release dropped what the grip holds");
  assert.equal(step({ grip: 'up' }), false);
});

test("near a touch target the grip presses nothing, and the trigger's hold is its own to end", () => {
  const step = controller('touch');
  assert.equal(step({ trigger: 'down' }), true);
  assert.equal(step({ grip: 'down' }), true);
  assert.equal(step({ grip: 'up' }), true);
  assert.equal(step({ trigger: 'up' }), false);
});
