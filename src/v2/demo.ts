import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, OneHandGrabbable, SphereGeometry, type World } from '@iwsdk/core';
import { SILL } from '../station/layout.js';
import { MemoryOrb, PathHandle, PathKindEnum } from './components.js';
import { onV2 } from './events.js';
import { leaveMemory } from './memory-portal-system.js';

/**
 * Dev server only (dev-tools.ts, key 6): the new version's parts set out on
 * the sill to try with a hand, a ray and the emulator's Pinch button. A
 * pump's lever that swings toward the window and back, a rope that pulls
 * down and springs back up, and a memory orb: held up to the face it opens
 * into white, and 2.5 s later the demo leaves through white and puts the
 * orb back. Placeholder shapes; the real models come with the new scenes.
 */
let setOut = false;

export function setOutDemo(world: World): void {
  if (setOut) return;
  setOut = true;
  const wood = new MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.8 });
  const iron = new MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.5, metalness: 0.6 });

  // The pump's lever: a stick standing on a pivot, its knob the grip; it swings about x, from leaning back to leaning forward.
  const lever = new Group();
  lever.name = 'DemoPumpLever';
  const stick = new Mesh(new CylinderGeometry(0.008, 0.01, 0.2, 10), iron);
  stick.position.y = 0.1;
  const knob = new Mesh(new SphereGeometry(0.018, 14, 10), wood);
  knob.position.y = 0.2;
  lever.add(stick, knob);
  const pivot = [0.12, SILL.top + 0.02, -0.33] as const;
  lever.position.set(...pivot);
  world.createTransformEntity(lever).addComponent(PathHandle, {
    kind: PathKindEnum.Swing,
    a: [...pivot],
    axis: [1, 0, 0],
    from: 0.55,
    to: -0.55,
    grip: [0, 0.2, 0],
    reach: 0.05,
  });

  // The rope: a wooden bar on a cord, pulled down 20 cm; let go, it springs back up.
  const rope = new Group();
  rope.name = 'DemoRope';
  const bar = new Mesh(new BoxGeometry(0.1, 0.022, 0.022), wood);
  const cord = new Mesh(new CylinderGeometry(0.004, 0.004, 0.5, 6), wood);
  cord.position.y = 0.26;
  rope.add(bar, cord);
  const top = [-0.16, SILL.top + 0.27, -0.36] as const;
  rope.position.set(...top);
  world.createTransformEntity(rope).addComponent(PathHandle, {
    kind: PathKindEnum.Slide,
    a: [...top],
    b: [top[0], top[1] - 0.2, top[2]],
    grip: [0, 0, 0],
    rest: 0,
    returnSpeed: 1.5,
    reach: 0.05,
  });
  // The memory orb: a warm glowing ball on the sill, taken by a pinch.
  const orb = new Mesh(new SphereGeometry(0.035, 24, 16), new MeshBasicMaterial({ color: 0xffe2a8 }));
  orb.name = 'DemoMemoryOrb';
  const home = [0.32, SILL.top + 0.045, -0.3] as const;
  orb.position.set(...home);
  world.createTransformEntity(orb).addComponent(OneHandGrabbable, { rotate: true, translate: true }).addComponent(MemoryOrb, { memory: 'demo' });
  onV2('memoryEnter', ({ memory }) => {
    console.info(`[v2 demo] in the memory '${memory}'; out again in 2.5 s`);
    window.setTimeout(() => leaveMemory(memory, 'fade'), 2500);
  });
  onV2('memoryLeave', ({ memory }) => {
    console.info(`[v2 demo] back from '${memory}'`);
    orb.position.set(...home);
    orb.visible = true;
  });
  console.info('[v2 demo] a pump lever, a rope and a memory orb on the sill');
}
