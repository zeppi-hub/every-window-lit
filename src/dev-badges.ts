import { CanvasTexture, createSystem, Mesh, MeshBasicMaterial, type Object3D, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { largerCaptions } from './comfort.js';
import { BADGE_CANVAS, type BadgeFor, badgeFont, badgeSize, badgesShown, loadBadges, type PlacedBadge, placeBadges, STEP_BADGES, TOCCO_END } from './key-badges.js';
import { TAP_ME } from './season/lines.js';
import { onSignal } from './signals.js';
import { captionFont, type CaptionSize, captionSize, LINE_CANVAS, layoutLine } from './station/caption.js';
import { LINE_SIZE, STEP_PLACES } from './station/tocco.js';
import { linePanel } from './talk.js';

/**
 * Dev server only (dev-tools.ts registers it, and only the dev server
 * loads dev-tools.ts): the key badges beside Tocco's instructions in the
 * desktop emulator (key-badges.ts lays them out). One small panel, drawn
 * only while a step's line is up with the badges shown; it follows his line
 * wherever it hangs, facing the seat with it.
 */

/** The badges' canvas, px for px as on his line's. */
const CANVAS = BADGE_CANVAS;
const METRES_PER_PX = LINE_SIZE.h / LINE_CANVAS.h;

/**
 * Whether this page runs in the desktop emulator (IWER), as the dev server's
 * injected script marks it: never on a headset's browser on the dev server,
 * which gets no emulator or its native variants ('IWER-native-override',
 * 'IWER-native-gaze').
 */
export function inEmulator(): boolean {
  return (window as { __IWSDK_EMULATION_PROFILE?: { runtime?: string | null } }).__IWSDK_EMULATION_PROFILE?.runtime === 'IWER';
}

export class KeyBadgeSystem extends createSystem({}) {
  private line: Object3D | null = null;
  private ask: Object3D | null = null;
  private panel!: Mesh;
  private texture!: CanvasTexture;
  private context: CanvasRenderingContext2D | null = null;
  /** Where the row's middle is on his line's panel (m), and the same turned and carried with it. */
  private offset = new Vector3();
  private turned = new Vector3();
  /** What the badges were last laid out for: redrawn only when one of these changes. */
  private lastText = '';
  private lastFor: BadgeFor | '' = '';
  private lastLarge = false;
  private lastAt: object | null = null;
  private drawn = false;

  init(): void {
    loadBadges(() => window.localStorage);
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS.w;
    canvas.height = CANVAS.h;
    this.context = canvas.getContext('2d');
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.panel = new Mesh(
      new PlaneGeometry(CANVAS.w * METRES_PER_PX, CANVAS.h * METRES_PER_PX),
      new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
    this.panel.name = 'KeyBadges';
    this.panel.renderOrder = 3;
    this.panel.visible = false;
    this.world.createTransformEntity(this.panel, { persistent: true });
    this.line = this.world.scene.getObjectByName('ToccoLine') ?? null;
    this.ask = this.world.scene.getObjectByName('AskPanel') ?? null;
    this.cleanupFuncs.push(onSignal('restart', () => this.restart()));
    console.info(`[badges] key badges ${inEmulator() ? 'in the emulator' : 'off: not the emulator'}, ${badgesShown() ? 'shown' : 'hidden with H'}`);
  }

  /** The season starts over: the next line's badges are laid out afresh. */
  restart(): void {
    this.lastText = '';
    this.lastFor = '';
    this.lastAt = null;
    this.drawn = false;
    this.panel.visible = false;
  }

  update(): void {
    const line = this.line;
    const shown = linePanel();
    let what: BadgeFor | '' = '';
    if (shown.text !== '') what = shown.text === TAP_ME ? 'tocco' : shown.step in STEP_BADGES ? (shown.step as BadgeFor) : '';
    const on = line != null && line.visible && what !== '' && STEP_BADGES[what].length > 0 && badgesShown() && inEmulator() && !(this.ask?.visible ?? false);
    if (!on || line == null || shown.at == null || what === '') {
      this.panel.visible = false;
      return;
    }
    const large = largerCaptions();
    if (!this.drawn || shown.text !== this.lastText || what !== this.lastFor || large !== this.lastLarge || shown.at !== this.lastAt) {
      this.lastText = shown.text;
      this.lastFor = what;
      this.lastLarge = large;
      this.lastAt = shown.at;
      this.drawn = true;
      this.layout(shown.text, what, shown.at, large);
    }
    // With his line, turned to the seat as it is, just in front of it.
    this.panel.quaternion.copy(line.quaternion);
    this.turned.copy(this.offset).applyQuaternion(line.quaternion);
    this.panel.position.copy(line.position).add(this.turned);
    this.panel.visible = true;
  }

  /** Lays the row out beside the band his line is drawn with, and draws it. */
  private layout(text: string, what: BadgeFor, at: { x: number; y: number; z: number }, large: boolean): void {
    const g = this.context;
    if (g == null) return;
    const size = captionSize(large);
    const arrow = what !== 'tocco';
    g.font = captionFont(size.font);
    const { band } = layoutLine(text, size, arrow, (row) => g.measureText(row).width);
    const end = what === 'tocco' ? TOCCO_END : STEP_PLACES[what].arrow.end;
    const measure = (word: string, px: number) => {
      g.font = badgeFont(px);
      return g.measureText(word).width;
    };
    const badges = placeBadges(STEP_BADGES[what], band, end, at, size, METRES_PER_PX, measure);
    const left = Math.min(...badges.map((b) => b.x - b.w / 2));
    const right = Math.max(...badges.map((b) => b.x + b.w / 2));
    const middle = (left + right) / 2;
    this.offset.set(middle * METRES_PER_PX, badges[0].y * METRES_PER_PX, 0.002);
    g.clearRect(0, 0, CANVAS.w, CANVAS.h);
    for (const badge of badges) this.drawBadge(g, badge, CANVAS.w / 2 + badge.x - middle, size);
    this.texture.needsUpdate = true;
    console.info(
      `[badges] ${badges.map((b) => (b.label === '' ? `[${b.key}]` : `[${b.key}] ${b.label}`)).join(' ')} beside ${JSON.stringify(text)} at its ${end} end, ${large ? 'larger' : 'normal'} captions`,
    );
  }

  /** A dark backing with a light key cap on it, the key's letter, and its word after it if it has one. */
  private drawBadge(g: CanvasRenderingContext2D, badge: PlacedBadge, x: number, size: CaptionSize): void {
    const s = badgeSize(size);
    const top = CANVAS.h / 2 - badge.h / 2;
    const left = x - badge.w / 2;
    g.fillStyle = 'rgba(20, 18, 16, 0.82)';
    g.beginPath();
    g.roundRect(left, top, badge.w, badge.h, badge.h * 0.3);
    g.fill();
    const capX = left + s.pad;
    const capY = top + s.pad;
    // The cap's darker foot, then its face: a keyboard key.
    g.fillStyle = '#b9a581';
    g.beginPath();
    g.roundRect(capX, capY, s.cap, s.cap, s.cap * 0.2);
    g.fill();
    g.fillStyle = '#f6ecd9';
    g.beginPath();
    g.roundRect(capX, capY, s.cap, s.cap - Math.max(3, Math.round(s.cap * 0.08)), s.cap * 0.2);
    g.fill();
    g.fillStyle = '#2b241e';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = badgeFont(s.letter, true);
    g.fillText(badge.key, capX + s.cap / 2, capY + s.cap / 2 - 1);
    if (badge.label === '') return;
    g.fillStyle = '#f6f1e6';
    g.textAlign = 'left';
    g.font = badgeFont(s.label);
    g.fillText(badge.label, capX + s.cap + s.inner, capY + s.cap / 2);
  }
}
