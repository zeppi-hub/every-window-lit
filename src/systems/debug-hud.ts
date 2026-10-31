import {
  CanvasTexture,
  createSystem,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { litShare } from '../station/materials.js';
import { townTime } from '../timeflow.js';

const REFRESH_SECONDS = 0.5;

/**
 * A small frame-rate and draw-call readout, always on in the dev server and
 * shown to testers of the published build when the URL has `?debug`. It hangs
 * on the left side of the window opening and also logs to the console twice
 * a second.
 */
export class DebugHudSystem extends createSystem({}) {
  private enabled = false;
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;
  private texture!: CanvasTexture;
  private frames = 0;
  private elapsed = 0;

  init(): void {
    this.enabled =
      import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
    if (!this.enabled) return;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 96;
    this.context = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;

    const panel = new Mesh(
      new PlaneGeometry(0.18, 0.0675),
      new MeshBasicMaterial({ map: this.texture, transparent: true }),
    );
    panel.name = 'DebugHud';
    panel.position.set(-0.56, 1.32, -0.17);
    panel.rotation.y = 0.5;
    this.world.createTransformEntity(panel, { persistent: true });
    this.draw('starting…', '');
  }

  update(delta: number): void {
    if (!this.enabled) return;
    this.frames += 1;
    this.elapsed += delta;
    if (this.elapsed < REFRESH_SECONDS) return;
    const fps = this.frames / this.elapsed;
    const { calls, triangles } = this.world.renderer.info.render;
    this.frames = 0;
    this.elapsed = 0;
    const line1 = `${fps.toFixed(0)} fps`;
    const line2 = `${calls} draws · ${(triangles / 1000).toFixed(1)}k tris`;
    this.draw(line1, line2);
    console.debug(`[hud] ${line1} · ${line2} · town ${townTime().toFixed(2)} · lit ${litShare.value.toFixed(2)}`);
  }

  private draw(line1: string, line2: string): void {
    const ctx = this.context;
    ctx.fillStyle = 'rgba(20, 18, 16, 0.78)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#f4e9d0';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(line1, 14, 40);
    ctx.font = '24px sans-serif';
    ctx.fillText(line2, 14, 78);
    this.texture.needsUpdate = true;
  }
}
