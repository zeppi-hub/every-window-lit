import { createSystem, type Mesh, Vector3 } from '@iwsdk/core';

/** Seconds between looks at the session's input sources; they change rarely. */
const CHECK_SECONDS = 0.5;

/**
 * The game is played with bare hands (META_VR_FIKIR.md §3). While the
 * headset reports controllers and no tracked hands, a small sign floats a
 * little below the view, "Put the controllers down.", and goes once hands
 * are seen. Never shown outside an immersive session.
 */
export class HandsSystem extends createSystem({}) {
  private sign: Mesh | null = null;
  private since = 0;
  private ahead = new Vector3();

  init(): void {
    this.sign = (this.world.scene.getObjectByName('HandsSign') as Mesh | undefined) ?? null;
  }

  update(delta: number): void {
    const sign = this.sign;
    if (sign == null) return;
    this.since += delta;
    if (this.since >= CHECK_SECONDS) {
      this.since = 0;
      const session = this.world.renderer.xr.getSession();
      let controllers = false;
      let hands = false;
      if (session != null) {
        for (const source of session.inputSources) {
          if (source.hand != null) hands = true;
          else if (source.gamepad != null) controllers = true;
        }
      }
      sign.visible = controllers && !hands;
    }
    if (!sign.visible) return;
    // Half a metre ahead of the face and a little below the line of sight.
    // The head's pose for this frame (the input system sets it before user systems run; the camera gets it only at render).
    const head = this.player.head;
    head.getWorldPosition(sign.position);
    head.getWorldDirection(this.ahead).negate();
    sign.position.addScaledVector(this.ahead, 0.5);
    sign.position.y -= 0.12;
    head.getWorldQuaternion(sign.quaternion);
  }
}
