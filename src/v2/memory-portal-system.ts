import { BackSide, createSystem, type Entity, GrabSystem, Grabbed, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import { lessMotion } from '../comfort.js';
import { MemoryOrb } from './components.js';
import { emitV2 } from './events.js';
import { PortalTimeline } from './portal.js';

/** The orb's own size as it starts to grow, and the white sphere's size round the head once it has (m). */
const ORB_RADIUS = 0.05;
const ROUND_RADIUS = 0.35;
/** Held this long near the face before it opens, so an orb only passing the face does not (s). */
const HOLD_SECONDS = 0.25;

/** Leaves still to be made through white (leaveMemory), taken by MemoryPortalSystem. */
const leaves: string[] = [];

/**
 * Leave a memory: 'cut' swaps the world at once, on the player's move (the
 * hand stays where it is; the design's way back); 'fade' goes through
 * white as the way in does.
 */
export function leaveMemory(memory: string, how: 'cut' | 'fade'): void {
  if (how === 'cut') emitV2('memoryLeave', { memory });
  else leaves.push(memory);
}

/**
 * The way into a memory (v2/portal.ts): an orb (MemoryOrb) held up to the
 * face for a moment grows round the head into white; memoryEnter is sent
 * at full white (the scene swaps the world; the orb is let go and hidden),
 * and the white opens. One white sphere on the head, drawn over everything,
 * only while it shows. Less motion: no growing, a short fade.
 */
export class MemoryPortalSystem extends createSystem({
  orbs: { required: [MemoryOrb] },
}) {
  private readonly timeline = new PortalTimeline();
  private sphere: Mesh | null = null;
  private material: MeshBasicMaterial | null = null;
  private readonly head = new Vector3();
  private readonly at = new Vector3();
  /** Where the orb was, in the head's frame, as it began to grow. */
  private readonly from = new Vector3();
  private nearFor = 0;
  private nearOrb: Entity | null = null;

  init(): void {
    this.material = new MeshBasicMaterial({ color: 0xfff8ec, side: BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
    this.sphere = new Mesh(new SphereGeometry(1, 32, 16), this.material);
    this.sphere.name = 'MemoryPortal';
    this.sphere.renderOrder = 9000;
    this.sphere.frustumCulled = false;
    this.sphere.visible = false;
    this.sphere.pointerEvents = 'none';
    this.player.head.add(this.sphere);
  }

  update(delta: number): void {
    if (!this.timeline.busy) {
      const memory = leaves.shift();
      if (memory != null) this.timeline.leave(lessMotion(), () => emitV2('memoryLeave', { memory }));
      else this.watchOrbs(delta);
    }
    this.timeline.update(delta);
    this.draw();
  }

  /** An orb held near the face for HOLD_SECONDS starts the way in. */
  private watchOrbs(delta: number): void {
    this.player.head.getWorldPosition(this.head);
    let near: Entity | null = null;
    for (const entity of this.queries.orbs.entities) {
      const object = entity.object3D;
      if (object == null || !object.visible || !entity.hasComponent(Grabbed)) continue;
      object.getWorldPosition(this.at);
      if (this.at.distanceTo(this.head) <= (entity.getValue(MemoryOrb, 'enterDistance') ?? 0.2)) near = entity;
    }
    if (near == null || near !== this.nearOrb) {
      this.nearOrb = near;
      this.nearFor = 0;
      return;
    }
    this.nearFor += delta;
    if (this.nearFor < HOLD_SECONDS) return;
    const orb = near;
    const object = orb.object3D;
    const memory = orb.getValue(MemoryOrb, 'memory') ?? '';
    if (object != null) this.player.head.worldToLocal(object.getWorldPosition(this.from));
    this.nearOrb = null;
    this.nearFor = 0;
    if (import.meta.env.DEV) console.info(`[memory] ${memory}: the orb opens`);
    this.timeline.enter(lessMotion(), () => {
      this.world.getSystem(GrabSystem)?.forceRelease(orb);
      if (orb.object3D != null) orb.object3D.visible = false;
      emitV2('memoryEnter', { memory });
    });
  }

  private draw(): void {
    const sphere = this.sphere;
    const material = this.material;
    if (sphere == null || material == null) return;
    const t = this.timeline;
    sphere.visible = t.busy && t.white > 0.001;
    if (!sphere.visible) return;
    material.opacity = t.white;
    sphere.scale.setScalar(ORB_RADIUS + (ROUND_RADIUS - ORB_RADIUS) * t.grown);
    sphere.position.copy(this.from).multiplyScalar(1 - t.grown);
  }
}
