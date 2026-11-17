import { CanvasTexture, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace, Vector3, type World } from '@iwsdk/core';
import { drawLine } from '../../station/family.js';
import { sharpText, TEXT_ANISOTROPY } from '../../station/sharp-text.js';
import { LINES, type LineId } from './lines.js';

/** A caption's size (m, the lines' 4:1), and how long a line stays up (s): a base and so much per letter, within bounds. */
const SIZE = { w: 0.6, h: 0.15 } as const;
const BASE_SECONDS = 1.4;
const PER_LETTER = 0.055;
const LONGEST = 7;

/**
 * Spoken lines as captions beside whoever speaks (the design has no voice
 * recordings): "Gray: …", above the speaker's head or at a given point,
 * turned to the player and kept a readable size at any distance. A line
 * with no speaker in the table is the chosen person's (S03-4 and others).
 * One line at a time; say() resolves once it has been up long enough to read.
 */
export class Captions {
  private readonly panel: Mesh;
  private readonly texture: CanvasTexture;
  private readonly anchor = new Vector3();
  private follow: Object3D | null = null;
  private lift = 0;
  private left = 0;
  private resolve: (() => void) | null = null;
  private readonly eye = new Vector3();
  /** The chosen person's name, for the lines that are theirs. */
  persona = '';

  constructor(world: World) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = TEXT_ANISOTROPY;
    this.panel = new Mesh(new PlaneGeometry(SIZE.w, SIZE.h), sharpText(new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, depthTest: false })));
    this.panel.name = 'Caption';
    this.panel.renderOrder = 8;
    this.panel.visible = false;
    this.panel.pointerEvents = 'none';
    world.createTransformEntity(this.panel, { persistent: true });
  }

  /** Show line `id` at `where` (a point, or an object followed, `lift` m above it); resolves when it has been read. */
  say(id: LineId, where: Vector3 | Object3D, lift = 0.35): Promise<void> {
    const line = LINES[id];
    const speaker = line.speaker === '' ? this.persona : line.speaker;
    const text = speaker === '' ? line.text : `${speaker}: ${line.text}`;
    drawLine(this.texture, text);
    if (where instanceof Vector3) {
      this.anchor.copy(where);
      this.follow = null;
    } else this.follow = where;
    this.lift = lift;
    this.left = Math.min(LONGEST, BASE_SECONDS + PER_LETTER * line.text.length);
    this.panel.visible = true;
    this.resolve?.();
    if (import.meta.env.DEV) console.info(`[say] ${id} ${text}`);
    return new Promise((done) => {
      this.resolve = done;
    });
  }

  hide(): void {
    this.panel.visible = false;
    this.left = 0;
    this.resolve?.();
    this.resolve = null;
  }

  update(delta: number, head: Object3D): void {
    if (!this.panel.visible) return;
    if (this.follow != null) this.follow.getWorldPosition(this.anchor);
    head.getWorldPosition(this.eye);
    this.panel.position.copy(this.anchor);
    this.panel.position.y += this.lift;
    // Turned to the eye, and as large at any distance as at 1.2 m.
    this.panel.lookAt(this.eye);
    this.panel.scale.setScalar(Math.max(0.5, this.panel.position.distanceTo(this.eye) / 1.2));
    this.left -= delta;
    if (this.left <= 0) {
      this.panel.visible = false;
      const done = this.resolve;
      this.resolve = null;
      done?.();
    }
  }
}
