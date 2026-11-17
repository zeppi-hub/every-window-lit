import { BackSide, Mesh, MeshBasicMaterial, type Object3D, SphereGeometry, Vector3 } from '@iwsdk/core';
import { lessMotion } from '../../comfort.js';

/** How long the view fades to black, and back, when the player is moved (s). */
const FADE = 0.3;

/**
 * Where the player is (the parrot sits: Gray's shoulder, a bench's back, a
 * held-out arm): moving puts the eye exactly at a point, facing a heading,
 * behind a short fade to black (VR's standard comfort for a change of
 * place). The fade is a black sphere on the head, drawn over everything.
 */
export class Rig {
  private readonly veil: Mesh;
  private opacity = 0;
  private target = 0;
  private readonly head = new Vector3();
  private waiters: { level: number; done: () => void }[] = [];

  constructor(
    private readonly player: Object3D,
    private readonly headObject: Object3D,
  ) {
    this.veil = new Mesh(new SphereGeometry(0.3, 16, 10), new MeshBasicMaterial({ color: 0x000000, side: BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.veil.name = 'MoveVeil';
    this.veil.renderOrder = 9500;
    this.veil.visible = false;
    this.veil.pointerEvents = 'none';
    headObject.add(this.veil);
  }

  /** Put the eye at `eye`, facing `yaw` (radians; 0 faces -z), at once. */
  place(eye: Vector3, yaw: number): void {
    this.player.rotation.set(0, yaw, 0);
    this.player.updateMatrixWorld(true);
    this.headObject.getWorldPosition(this.head);
    this.player.position.add(eye.clone().sub(this.head));
    this.player.updateMatrixWorld(true);
  }

  /** Fade out, move, fade in. */
  async move(eye: Vector3, yaw: number): Promise<void> {
    await this.fadeTo(1);
    this.place(eye, yaw);
    await this.fadeTo(0);
  }

  fadeTo(level: number): Promise<void> {
    this.target = level;
    return new Promise((done) => this.waiters.push({ level, done }));
  }

  update(delta: number): void {
    const speed = delta / (lessMotion() ? FADE * 0.6 : FADE);
    this.opacity = this.opacity < this.target ? Math.min(this.target, this.opacity + speed) : Math.max(this.target, this.opacity - speed);
    (this.veil.material as MeshBasicMaterial).opacity = this.opacity;
    this.veil.visible = this.opacity > 0.001;
    if (this.opacity === this.target && this.waiters.length > 0) {
      const waiting = this.waiters;
      this.waiters = [];
      for (const w of waiting) w.done();
    }
  }
}
