import {
  type CanvasTexture,
  createSystem,
  type Entity,
  Grabbed,
  GrabSystem,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  Vector3,
} from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { onSignal } from '../signals.js';
import { stance } from '../stance.js';
import { BOX_DISPLAY, BOX_PUSH_THRESHOLD, BOX_SCALE, drawCurtain, drawLine, ROOM_BOX } from '../station/family.js';

/** Seconds for the window to fly across the square, either way. */
const FLIGHT = 1.1;
/** Its size as it leaves the facade, matching the French window. */
const START_SCALE = 0.85;
/** How high its path arcs over the square. */
const ARC = 1.4;
/** How quickly a box let go short of the push springs back. */
const SPRING_RATE = 12;
/** Lina's arm goes up and down this often. */
const WAVE_SECONDS = 0.5;
/** Phases in which the family can be visited; not while the basket is on its way up, on the sill or going down. */
const VISITABLE: ReadonlySet<string> = new Set([Phase.Morning, Phase.Bell, Phase.Landed, Phase.Days, Phase.Sunday]);
/** Phases after the basket has landed, when the week's object and line show. */
const AFTER: ReadonlySet<string> = new Set([Phase.Landed, Phase.Days, Phase.Sunday]);

const LINES = [
  'Tessa: Keeper filled the pumps. Car tomorrow?',
  "Tessa: The clinic's paying my fuel this week.",
  'Tessa: A tram? Bike till then.',
] as const;
const NOTHING = 'Dario: The basket came down empty.';
/** How far below the town the glass and hook wait while the box is home. */
const PARKED_DROP = 200;

type Mode = 'away' | 'coming' | 'shown' | 'going';

/**
 * Tessa's window, pulled into the Keeper's hands. Point at it across the
 * square and pinch, and it comes off the facade and floats into the open
 * window as a room box; once the basket has gone down, the family's shadows
 * and what they say follow the Keeper's choice. Knock on the glass and Lina
 * leaves a paper boat on the ledge. Push the box away (or poke its brass
 * hook, or point at the window again) and it flies home. Closing the
 * shutters, the basket starting up or the Keeper going down to the square
 * sends it home too; from the square, pointing at the window calls nothing.
 */
export class FamilySystem extends createSystem({
  week: { required: [Week] },
  held: { required: [Grabbed] },
}) {
  private mode: Mode = 'away';
  private time = 0;
  private elapsed = 0;
  private waveTimer = 0;
  private wave = false;
  /** Whether the family was visited since the basket landed; until then their window glows. */
  private visited = false;
  private lastPhase = '';
  private lastChosen = -2;
  private box: Object3D | null = null;
  private glass: Object3D | null = null;
  private hook: Object3D | null = null;
  private line: Object3D | null = null;
  private boat: Object3D | null = null;
  private props: Object3D[] = [];
  private target: Mesh | null = null;
  private curtainMaterial: MeshBasicMaterial | null = null;
  private frames: CanvasTexture[] = [];
  private lineTexture: CanvasTexture | null = null;
  private home = new Vector3();
  private display = new Vector3(BOX_DISPLAY.x, BOX_DISPLAY.y, BOX_DISPLAY.z);
  private from = new Vector3();
  private to = new Vector3();
  private path = new Vector3();

  init(): void {
    const scene = this.world.scene;
    const find = (name: string) => scene.getObjectByName(name) ?? null;
    this.box = find('FamilyBox');
    this.glass = find('FamilyGlass');
    this.hook = find('FamilyHook');
    this.line = find('FamilyLine');
    this.boat = find('LinaBoat');
    this.props = ['FamilyCarKey', 'FamilyParcel', 'FamilyHelmet'].map(find).filter((o): o is Object3D => o != null);
    this.target = find('TessaWindow') as Mesh | null;
    const curtain = find('FamilyCurtain') as Mesh | null;
    this.curtainMaterial = (curtain?.material as MeshBasicMaterial | undefined) ?? null;
    this.frames = (curtain?.userData.frames as CanvasTexture[] | undefined) ?? [];
    this.lineTexture = ((this.line as Mesh | null)?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | null;
    if (this.target != null) {
      // The box leaves the facade with its glass where Tessa's glass is.
      this.home.copy(this.target.position);
      this.home.z -= (ROOM_BOX.d / 2) * START_SCALE;
    }
    this.place(this.home, START_SCALE, false);

    this.cleanupFuncs.push(
      onSignal('window', () => this.toggle()),
      onSignal('knock', () => {
        if (this.mode !== 'shown' || this.boat == null) return;
        this.boat.visible = true;
        this.waveTimer = 0;
      }),
      onSignal('latch', () => {
        if (this.mode === 'shown' || this.mode === 'coming') this.leave();
      }),
      onSignal('descend', () => {
        if (this.mode === 'shown' || this.mode === 'coming') this.leave();
      }),
    );
  }

  update(delta: number): void {
    this.elapsed += delta;
    const week = this.weekEntity();
    if (week == null || this.box == null) return;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const chosen = AFTER.has(phase) ? (week.getValue(Week, 'chosen') ?? -1) : -2;

    if (phase !== this.lastPhase) {
      if (phase === Phase.Landed) this.visited = false;
      if (phase === Phase.Shut && this.boat != null) this.boat.visible = false;
      if (!VISITABLE.has(phase) && (this.mode === 'shown' || this.mode === 'coming')) this.leave();
      this.lastPhase = phase;
    }
    if (chosen !== this.lastChosen) {
      this.lastChosen = chosen;
      this.props.forEach((prop, index) => {
        prop.visible = index === chosen;
      });
      if (this.mode !== 'away') this.drawFrames();
      if (this.lineTexture != null) drawLine(this.lineTexture, chosen === -2 ? '' : chosen >= 0 ? LINES[chosen] : NOTHING);
    }

    if (this.mode === 'coming' || this.mode === 'going') {
      const held = this.boxEntity();
      if (held != null) this.world.getSystem(GrabSystem)?.forceRelease(held);
      this.time += delta;
      const t = Math.min(1, this.time / FLIGHT);
      const e = t * t * (3 - 2 * t);
      const p = this.path.lerpVectors(this.from, this.to, e);
      p.y += ARC * Math.sin(Math.PI * t);
      const scale = this.mode === 'coming' ? START_SCALE + (BOX_SCALE - START_SCALE) * e : BOX_SCALE + (START_SCALE - BOX_SCALE) * e;
      this.place(p, scale, true);
      if (t >= 1) {
        this.mode = this.mode === 'coming' ? 'shown' : 'away';
        if (this.mode === 'away') this.place(this.home, START_SCALE, false);
      }
    } else if (this.mode === 'shown') {
      this.pushOrSpring(delta);
      this.waveTimer += delta;
      if (this.waveTimer >= WAVE_SECONDS) {
        this.waveTimer = 0;
        this.wave = !this.wave;
        // Both frames are drawn once; waving only swaps them.
        const frame = this.frames[this.wave ? 1 : 0];
        if (this.curtainMaterial != null && frame != null) this.curtainMaterial.map = frame;
      }
    }

    // Until they are visited after the basket lands, a warm light moves behind their curtain.
    if (this.target != null) {
      const hint = phase === Phase.Landed && !this.visited && this.mode === 'away';
      (this.target.material as MeshBasicMaterial).opacity = hint ? 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(this.elapsed * 2.6)) : 0;
    }
  }

  private weekEntity(): Entity | null {
    for (const entity of this.queries.week.entities) return entity;
    return null;
  }

  private boxEntity(): Entity | null {
    for (const entity of this.queries.held.entities) if (entity.object3D === this.box) return entity;
    return null;
  }

  private toggle(): void {
    if (this.mode === 'shown' || this.mode === 'coming') {
      this.leave();
      return;
    }
    const week = this.weekEntity();
    if (stance() === 'walk') return;
    if (week == null || !week.getValue(Week, 'shuttersOpen') || !VISITABLE.has(week.getValue(Week, 'phase') ?? '')) return;
    if (this.mode !== 'away') return;
    this.mode = 'coming';
    this.time = 0;
    this.visited = true;
    this.from.copy(this.home);
    this.to.copy(this.display);
    this.drawFrames();
  }

  /** The family's shadows for the week so far, with Lina's arm down and up. */
  private drawFrames(): void {
    this.frames.forEach((frame, index) => drawCurtain(frame, this.lastChosen, index === 1));
  }

  private leave(): void {
    const held = this.boxEntity();
    if (held != null) this.world.getSystem(GrabSystem)?.forceRelease(held);
    if (this.box == null || this.mode === 'away' || this.mode === 'going') return;
    this.mode = 'going';
    this.time = 0;
    this.from.copy(this.box.position);
    this.to.copy(this.home);
  }

  /** Held, the box can only be pushed straight away; pushed far enough it goes home. Let go short of that, it springs back. */
  private pushOrSpring(delta: number): void {
    if (this.box == null) return;
    const pushed = this.display.z - this.box.position.z;
    if (this.boxEntity() != null) {
      if (pushed >= BOX_PUSH_THRESHOLD) this.leave();
      else this.place(this.box.position, BOX_SCALE, true);
      return;
    }
    if (pushed > 0.0005) {
      this.box.position.lerp(this.display, 1 - Math.exp(-SPRING_RATE * delta));
      this.place(this.box.position, BOX_SCALE, true);
    }
  }

  /** Moves the box and everything that rides with it: the glass, the hook and the line above. */
  private place(centre: Vector3, scale: number, visible: boolean): void {
    if (this.box == null) return;
    const s = scale;
    const { w, h, d } = ROOM_BOX;
    this.box.position.copy(centre);
    this.box.scale.setScalar(s);
    this.box.visible = visible;
    // Pointer rays ignore visibility; parked over Tessa's window, the glass and the hook
    // would catch the pinch meant for the window, so away they go far below the town.
    const down = visible ? 0 : PARKED_DROP;
    if (this.glass != null) {
      this.glass.position.set(centre.x, centre.y + 0.02 * s - down, centre.z + (d / 2 + 0.03) * s);
      this.glass.scale.setScalar(s);
      this.glass.visible = visible;
    }
    if (this.hook != null) {
      this.hook.position.set(centre.x + (w / 2 - 0.1) * s, centre.y + (h / 2 + 0.16) * s - down, centre.z + (d / 2 + 0.03) * s);
      this.hook.scale.setScalar(s);
      this.hook.visible = visible;
    }
    if (this.line != null) {
      this.line.position.set(centre.x, centre.y + (h / 2 + 0.32) * s, centre.z + (d / 2) * s);
      this.line.scale.setScalar(s / BOX_SCALE);
      this.line.visible = visible && this.lastChosen !== -2;
    }
  }
}
