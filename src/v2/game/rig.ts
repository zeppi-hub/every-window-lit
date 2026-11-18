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
  private readonly seat = new Vector3();
  private seatYaw = 0;
  private seated = false;
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
    this.seat.copy(eye);
    this.seatYaw = yaw;
    this.seated = true;
  }

  /**
   * Carry the player along with a moving seat (a wire, a swing, a flight):
   * called every frame with where the seat's eye is now. Unlike place(), it
   * moves the player by how far the seat has moved and leaves the head's own
   * movement alone. In a headset, place() every frame would cancel every
   * lean and turn of the body (the world would stick to the head); here the
   * player can lean out over the wire and the wire stays where it is.
   */
  ride(eye: Vector3, yaw: number): void {
    if (!this.seated || yaw !== this.seatYaw) {
      this.place(eye, yaw);
      return;
    }
    this.player.position.x += eye.x - this.seat.x;
    this.player.position.y += eye.y - this.seat.y;
    this.player.position.z += eye.z - this.seat.z;
    this.player.updateMatrixWorld(true);
    this.seat.copy(eye);
  }

  /** Fade out, move, fade in. */
  async move(eye: Vector3, yaw: number): Promise<void> {
    await this.fadeTo(1);
    this.place(eye, yaw);
    await this.fadeTo(0);
  }

  /** Black at once, with no fade (the dark the day opens in). */
  black(): void {
    this.opacity = 1;
    this.target = 1;
    (this.veil.material as MeshBasicMaterial).opacity = 1;
    this.veil.visible = true;
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
