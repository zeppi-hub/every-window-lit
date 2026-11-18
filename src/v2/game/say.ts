import { largerCaptions } from '../../comfort.js';
import { CanvasTexture, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace, Vector3, type World } from '@iwsdk/core';
import { drawLine } from '../../station/family.js';
import { sharpText, TEXT_ANISOTROPY } from '../../station/sharp-text.js';
import { LINES, type LineId } from './lines.js';

/** A caption's size (m, the lines' 4:1), and how long a line stays up (s): a base and so much per letter, within bounds. */
const SIZE = { w: 0.6, h: 0.15 } as const;
/** A caption is as large to the eye at any distance as it is at this one (m): three quarters of its old size, so it covers less of the view (its words still about 2.3% of the distance tall). */
const READ_AT = 1.6;
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
/** Who speaks, by colour: the leader in gold, the bird's own people warm, everyone else pale. */
const NAME_COLOURS: Readonly<Record<string, string>> = { Gray: '#ffc83d', Maya: '#ff9d7a', Leo: '#8fc1ff', Sam: '#9be08f' };

/**
 * A spoken line drawn plainly: a dark, slightly see-through plate with
 * round corners, the speaker's name small and in their colour over the
 * words, the words large and pale, on at most two rows. A text with no
 * "Name: " in front (the credits) is drawn as words alone.
 */
function drawCaption(texture: CanvasTexture, full: string): void {
  const canvas = texture.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (g == null) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  texture.needsUpdate = true;
  if (full === '') return;
  const cut = full.indexOf(': ');
  const name = cut > 0 && cut < 16 ? full.slice(0, cut) : '';
  const words = name === '' ? full : full.slice(cut + 2);
  const big = largerCaptions() ? 76 : 62;
  const small = Math.round(big * 0.6);
  const family = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  g.font = `600 ${big}px ${family}`;
  // Two rows at most, broken at the space nearest the middle when one row would be too wide.
  let rows = [words];
  if (g.measureText(words).width > canvas.width - 120) {
    const middle = Math.floor(words.length / 2);
    let at = -1;
    for (let k = 0; k < words.length; k += 1) {
      if (words[k] === ' ' && (at < 0 || Math.abs(k - middle) < Math.abs(at - middle))) at = k;
    }
    if (at > 0) rows = [words.slice(0, at), words.slice(at + 1)];
  }
  const widest = Math.min(canvas.width - 72, Math.max(...rows.map((row) => g.measureText(row).width), name === '' ? 0 : name.length * small * 0.7));
  const pad = 30;
  const head = name === '' ? 0 : small + 10;
  const tall = head + rows.length * big * 1.18 + pad * 1.4;
  const wide = widest + pad * 2;
  const left = (canvas.width - wide) / 2;
  const top = (canvas.height - tall) / 2;
  g.fillStyle = 'rgba(11, 14, 20, 0.72)';
  g.beginPath();
  g.roundRect(left, top, wide, tall, 22);
  g.fill();
  g.textAlign = 'left';
  g.textBaseline = 'top';
  if (name !== '') {
    g.font = `700 ${small}px ${family}`;
    g.fillStyle = NAME_COLOURS[name] ?? '#c9d3e0';
    g.fillText(name.toUpperCase(), left + pad, top + pad * 0.6);
  }
  g.font = `600 ${big}px ${family}`;
  g.fillStyle = '#f4f1ea';
  rows.forEach((row, i) => g.fillText(row, left + pad, top + pad * 0.6 + head + i * big * 1.18, widest));
}

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
  /** English captions on or off (the start page); off, the lines still take their time, unseen. */
  enabled = true;

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
    if (import.meta.env.DEV) console.info(`[say] ${id} ${text}`);
    return this.show(text, where, lift, line.text.length);
  }

  /** Show a text that is not a spoken line (the credits), the same way; `above` draws it over the dark of a fade. */
  show(text: string, where: Vector3 | Object3D, lift = 0.35, letters = text.length, above = false): Promise<void> {
    this.panel.renderOrder = above ? 9600 : 8;
    drawCaption(this.texture, text);
    if (where instanceof Vector3) {
      this.anchor.copy(where);
      this.follow = null;
    } else this.follow = where;
    this.lift = lift;
    this.left = Math.min(LONGEST, BASE_SECONDS + PER_LETTER * letters);
    this.panel.visible = true;
    this.shown = this.enabled || above;
    this.resolve?.();
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

  /** Whether the line now up is drawn (the credits always are). */
  private shown = true;

  update(delta: number, head: Object3D): void {
    if (!this.panel.visible) return;
    (this.panel.material as MeshBasicMaterial).opacity = this.shown ? 1 : 0;
    if (this.follow != null) this.follow.getWorldPosition(this.anchor);
    head.getWorldPosition(this.eye);
    this.panel.position.copy(this.anchor);
    this.panel.position.y += this.lift;
    // Turned to the eye, and as large at any distance as at READ_AT.
    this.panel.lookAt(this.eye);
    this.panel.scale.setScalar(Math.max(0.4, this.panel.position.distanceTo(this.eye) / READ_AT));
    this.left -= delta;
    if (this.left <= 0) {
      this.panel.visible = false;
      const done = this.resolve;
      this.resolve = null;
      done?.();
    }
  }
}
