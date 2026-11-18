import { CanvasTexture, createSystem, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { largerCaptions } from '../comfort.js';
import { currentGoal, onGoal, windowsLit } from './goal.js';

/** The plate's size (m), how far ahead of the eye it rests and how far below eye level (m). */
const SIZE = { w: 0.96, h: 0.3 } as const;
const AHEAD = 1.25;
const BELOW = 0.5;
/** It rests to the left of straight ahead, clear of the hands' work (radians). */
const ASIDE = 0.5;
/** It turns to stay ahead of the player once she has looked this far from it (radians), at this rate (1/s). */
const FOLLOW_FROM = 0.6;
const FOLLOW_RATE = 2.2;
/** A new goal is shown bright and a little larger for this long (s), then rests at this opacity. */
const FRESH_SECONDS = 4;
const REST_OPACITY = 0.72;

/**
 * The plate that says what to do now and how the city stands: a dark strip
 * low in front of the player, never fixed to her head (it rests in the
 * world and only swings round, slowly, when she has turned well away from
 * it). The top row is where she is in the day; the large row is the task;
 * pips count its steps; at the right, the windows still lit.
 */
export class GoalSystem extends createSystem({}) {
  private plate!: Mesh;
  private texture!: CanvasTexture;
  private dirty = true;
  private fresh = 0;
  private yaw = 0;
  private placed = false;
  private readonly head = new Vector3();
  private readonly look = new Vector3();
  private readonly turn = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);

  init(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 400;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.plate = new Mesh(new PlaneGeometry(SIZE.w, SIZE.h), new MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    this.plate.name = 'GoalPlate';
    this.plate.renderOrder = 9000;
    this.plate.visible = false;
    this.plate.pointerEvents = 'none';
    this.world.createTransformEntity(this.plate, { persistent: true });
    onGoal(() => {
      this.dirty = true;
      this.fresh = FRESH_SECONDS;
      if (import.meta.env.DEV) {
        const goal = currentGoal();
        const { lit, total } = windowsLit();
        console.info(`[goal] ${goal == null ? 'none' : `${goal.where} | ${goal.now}${goal.steps == null ? '' : ` | ${goal.steps[0]}/${goal.steps[1]}`}`} | windows ${lit}/${total}`);
      }
    });
  }

  update(delta: number): void {
    const goal = currentGoal();
    this.plate.visible = goal != null;
    if (goal == null) {
      this.placed = false;
      return;
    }
    if (this.dirty) {
      this.dirty = false;
      this.draw();
    }
    // Where the player is and which way she faces, flat.
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldQuaternion(this.turn);
    this.look.set(0, 0, -1).applyQuaternion(this.turn);
    const facing = Math.atan2(this.look.x, this.look.z);
    if (!this.placed) {
      this.yaw = facing;
      this.placed = true;
    }
    let off = facing - this.yaw;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(off) > FOLLOW_FROM || this.fresh > FRESH_SECONDS - 0.6) this.yaw += off * Math.min(1, delta * FOLLOW_RATE);
    this.plate.position.set(this.head.x + Math.sin(this.yaw + ASIDE) * AHEAD, this.head.y - BELOW, this.head.z + Math.cos(this.yaw + ASIDE) * AHEAD);
    this.plate.lookAt(this.head);
    this.fresh = Math.max(0, this.fresh - delta);
    const k = Math.min(1, this.fresh / 0.8);
    (this.plate.material as MeshBasicMaterial).opacity = REST_OPACITY + (1 - REST_OPACITY) * k;
    this.plate.scale.setScalar(1 + 0.08 * k);
    void this.up;
  }

  private draw(): void {
    const goal = currentGoal();
    const canvas = this.texture.image as HTMLCanvasElement;
    const g = canvas.getContext('2d');
    if (g == null || goal == null) return;
    const { lit, total } = windowsLit();
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(11, 14, 20, 0.86)';
    g.beginPath();
    g.roundRect(8, 8, W - 16, H - 16, 36);
    g.fill();
    g.strokeStyle = 'rgba(255, 200, 61, 0.55)';
    g.lineWidth = 4;
    g.stroke();
    const family = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    const scoreWide = total > 0 ? 330 : 0;
    const left = 52;
    const room = W - left - 40 - scoreWide;
    // Where in the day.
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = `700 52px ${family}`;
    g.fillStyle = '#ffc83d';
    g.fillText(goal.where, left, 38, room);
    // The task: one row if it fits, else two.
    const big = largerCaptions() ? 96 : 86;
    g.font = `600 ${big}px ${family}`;
    g.fillStyle = '#f4f1ea';
    let rows = [goal.now];
    if (g.measureText(goal.now).width > room) {
      const middle = Math.floor(goal.now.length / 2);
      let at = -1;
      for (let k = 0; k < goal.now.length; k += 1) {
        if (goal.now[k] === ' ' && (at < 0 || Math.abs(k - middle) < Math.abs(at - middle))) at = k;
      }
      if (at > 0) rows = [goal.now.slice(0, at), goal.now.slice(at + 1)];
    }
    const size = rows.length === 1 ? big : Math.round(big * 0.86);
    g.font = `600 ${size}px ${family}`;
    rows.forEach((row, i) => g.fillText(row, left, 112 + i * size * 1.12, room));
    // Steps: a pip for each, the done ones gold.
    if (goal.steps != null) {
      const [done, all] = goal.steps;
      for (let k = 0; k < all; k += 1) {
        g.beginPath();
        g.arc(left + 22 + k * 62, H - 50, 18, 0, Math.PI * 2);
        g.fillStyle = k < done ? '#ffc83d' : 'rgba(255,255,255,0.14)';
        g.fill();
        g.strokeStyle = '#ffc83d';
        g.lineWidth = 3;
        g.stroke();
      }
    }
    // The city's windows: a small lit window, the count, and a bar of how many are left.
    if (total > 0) {
      const x = W - scoreWide - 8;
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x, 44, 3, H - 88);
      g.fillStyle = '#ffd98a';
      g.fillRect(x + 40, 60, 54, 70);
      g.fillStyle = 'rgba(11,14,20,0.9)';
      g.fillRect(x + 65, 60, 4, 70);
      g.fillRect(x + 40, 93, 54, 4);
      g.textAlign = 'left';
      g.font = `700 64px ${family}`;
      g.fillStyle = '#f4f1ea';
      g.fillText(`${lit}`, x + 112, 58, 190);
      g.font = `600 34px ${family}`;
      g.fillStyle = '#c9d3e0';
      g.fillText(`of ${total} windows lit`, x + 40, 150, scoreWide - 70);
      const share = Math.max(0, Math.min(1, lit / total));
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(x + 40, 212, scoreWide - 80, 16);
      g.fillStyle = share > 0.5 ? '#ffc83d' : '#ff7a5a';
      g.fillRect(x + 40, 212, (scoreWide - 80) * share, 16);
    }
    this.texture.needsUpdate = true;
  }
}
