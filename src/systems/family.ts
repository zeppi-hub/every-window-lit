import {
  type CanvasTexture,
  createSystem,
  type Entity,
  Grabbed,
  GrabSystem,
  type InstancedMesh,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { largerCaptions, lessMotion } from '../comfort.js';
import { Phase, Week } from '../components.js';
import { HELP, type Kind } from '../season/model.js';
import { evening } from '../station/materials.js';
import { GREET_AFTER, GREET_AFTER_REVEAL, REPLY_LOOK_DEGREES, replyHolds, replyStep, type WindowFacts, type WindowState, windowLevel, windowState } from '../season/window-light.js';
import { AID_LINE, familyLine, HEAT_LINE } from '../season/lines.js';
import { keptHelps, realWeek, SEASON_WEEKS, weatherOf } from '../season/store.js';
import { aidSailed } from '../aid.js';
import { emitSignal, onSignal } from '../signals.js';
import { revealHeld, setFamilyVisited, setReply, setWindowLight } from '../talk.js';
import { stance } from '../stance.js';
import { BOX_DISPLAY, BOX_PUSH_THRESHOLD, BOX_SCALE, drawCurtain, drawLine, KEEPSAKES, placeRiders, ROOM_BOX } from '../station/family.js';

/** Seconds for the window to fly across the square, either way. */
const FLIGHT = 1.1;
/** With less motion (comfort.ts) it fades into the Keeper's window, and out of it, over this long instead. */
const FADE_SECONDS = 0.3;
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
/** The first week's mornings greet the Keeper with light and sound only: the window is first called once the basket has landed. */
const FIRST_VISITABLE: ReadonlySet<string> = new Set([Phase.Landed, Phase.Days, Phase.Sunday]);
/** Phases after the basket has landed, when the week's object and line show. */
const AFTER: ReadonlySet<string> = new Set([Phase.Landed, Phase.Days, Phase.Sunday]);

/** How far below the town the glass and hook wait while the box is home. */
const PARKED_DROP = 200;

type Mode = 'away' | 'coming' | 'shown' | 'going';

/** One mesh of the window as it fades: its own material, the see-through one it wears while fading, and its full opacity. */
interface Fading {
  mesh: Mesh;
  own: Material;
  fading: Material;
  opacity: number;
}

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
  private keepsakes: InstancedMesh | null = null;
  private maquetteHouse: Mesh | null = null;
  private glass: Object3D | null = null;
  private hook: Object3D | null = null;
  private line: Object3D | null = null;
  private boat: Object3D | null = null;
  private drawing: Object3D | null = null;
  private props: Record<Kind, Object3D[]> = { fuel: [], power: [], food: [] };
  private target: Mesh | null = null;
  private curtainMaterial: MeshBasicMaterial | null = null;
  private frames: CanvasTexture[] = [];
  private lineTexture: CanvasTexture | null = null;
  private home = new Vector3();
  private display = new Vector3(BOX_DISPLAY.x, BOX_DISPLAY.y, BOX_DISPLAY.z);
  private from = new Vector3();
  private to = new Vector3();
  private path = new Vector3();
  private glassAt = new Vector3();
  private hookAt = new Vector3();
  private lineAt = new Vector3();
  /** What the window's light needs of the week, refreshed each frame; its state and eased brightness. */
  private facts: WindowFacts = { phase: Phase.Shut, timer: 0, greetAt: GREET_AFTER, open: false, aid: false, chosen: -1, visited: false, helped: false, evening: 0, lamp: false, answered: -1, kept: -1 };
  private lightState: WindowState = 'dark';
  private light = 0;
  /** When the shutters began to close on the week just kept, and when Lina answered the Sunday lamp (this.elapsed; -1: not yet). */
  private keptAt = -1;
  /** Seconds into this morning when the window greets; later while Tocco holds a reveal. */
  private greetAt = GREET_AFTER;
  private answeredAt = -1;
  /** Lina's answer to the Sunday lamp: seconds waited so far (-1: not waiting), and whether her two notes have played. */
  private waited = -1;
  private called = false;
  private windowAt = new Vector3();
  private headAt = new Vector3();
  private facing = new Vector3();
  private headTurn = new Quaternion();
  /** Less motion: whether this visit fades rather than flies, the meshes that fade (made once), and whether their shaders are built. */
  private fades = false;
  private fading: Fading[] = [];
  private fadingReady = false;
  /** What the family's line says now, and the caption size it was drawn at (comfort.ts). */
  private lineText = '';
  private largeCaptions = false;

  init(): void {
    const scene = this.world.scene;
    const find = (name: string) => scene.getObjectByName(name) ?? null;
    this.box = find('FamilyBox');
    this.glass = find('FamilyGlass');
    this.hook = find('FamilyHook');
    this.line = find('FamilyLine');
    this.boat = find('LinaBoat');
    this.drawing = find('LinaDrawing');
    const props = (names: readonly string[]) => names.map(find).filter((o): o is Object3D => o != null);
    this.props = {
      fuel: props(['FamilyCarKey', 'FamilyParcel', 'FamilyHelmet']),
      power: props(['FamilyBill', 'FamilyLoaf', 'FamilyPinwheel']),
      food: props(['FamilyBag', 'FamilyLunchTin', 'FamilySeedling']),
    };
    this.target = find('TessaWindow') as Mesh | null;
    this.keepsakes = find('Keepsakes') as InstancedMesh | null;
    this.maquetteHouse = find('MaquetteHouse') as Mesh | null;
    this.countKeepsakes();
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
        if (this.mode !== 'shown') return;
        // In a solidarity week Lina leaves a drawing for the boat instead of her paper boat.
        const week = this.weekEntity();
        const aid = week != null && realWeek(week.getValue(Week, 'week') ?? 1)?.solidarity != null;
        const gift = aid ? this.drawing : this.boat;
        if (gift == null) return;
        gift.visible = true;
        this.waveTimer = 0;
      }),
      onSignal('latch', () => {
        if (this.mode === 'shown' || this.mode === 'coming') this.leave();
      }),
      // The week is kept as its shutters close: the window blinks goodbye through them, unless it was a solidarity
      // week (it only rests). Decided now, while the Week entity still holds the week kept.
      onSignal('kept', () => {
        const week = this.weekEntity();
        const aid = week != null && realWeek(week.getValue(Week, 'week') ?? 1)?.solidarity != null;
        this.keptAt = aid ? -1 : this.elapsed;
      }),
      // The latch, tried while the town waits for her answer: the shutters stay open and she answers now.
      onSignal('reply', () => {
        if (this.waited >= 0) this.answer('the latch');
      }),
      onSignal('descend', () => {
        if (this.mode === 'shown' || this.mode === 'coming') this.leave();
      }),
      onSignal('restart', () => this.restart()),
    );
  }

  /**
   * The season starts over from the start page: the window is home and
   * dark, no gift on its ledge, the sill's paper boats only as many as the
   * new season has earned (none), and nothing left of the old week's light:
   * no farewell still to blink, no answer given or awaited, the greeting at
   * its usual moment, the family not yet visited.
   */
  restart(): void {
    if (import.meta.env.DEV) console.info(`[family] restart: box ${this.mode}, window ${this.lightState}, ${this.keepsakes?.count ?? 0} boats on the sill, farewell ${this.keptAt >= 0}`);
    const held = this.boxEntity();
    if (held != null) this.world.getSystem(GrabSystem)?.forceRelease(held);
    if (this.fades && (this.mode === 'coming' || this.mode === 'going')) this.endFade();
    this.mode = 'away';
    this.time = 0;
    this.place(this.home, START_SCALE, false);
    if (this.boat != null) this.boat.visible = false;
    if (this.drawing != null) this.drawing.visible = false;
    this.visited = false;
    setFamilyVisited(false);
    this.keptAt = -1;
    this.answeredAt = -1;
    this.greetAt = GREET_AFTER;
    this.waited = -1;
    this.called = false;
    setReply(0);
    this.countKeepsakes();
    // The week is shut: its phase is already seen, and its props and line are worked out again on the next frame.
    this.lastPhase = Phase.Shut;
    this.lastChosen = -3;
    this.waveTimer = 0;
    this.wave = false;
    const frame = this.frames[0];
    if (this.curtainMaterial != null && frame != null) this.curtainMaterial.map = frame;
    this.lightState = 'dark';
    this.light = 0;
    setWindowLight('dark', 0);
    if (this.target != null) (this.target.material as MeshBasicMaterial).opacity = 0;
    if (import.meta.env.DEV) console.info(`[family] after restart: box ${this.mode}, ${this.keepsakes?.count ?? 0} boats`);
  }

  update(delta: number): void {
    this.elapsed += delta;
    const week = this.weekEntity();
    if (week == null || this.box == null) return;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const chosen = AFTER.has(phase) ? (week.getValue(Week, 'chosen') ?? -1) : -2;
    const real = realWeek(week.getValue(Week, 'week') ?? 1);
    const kind = real?.kind ?? 'fuel';
    const aid = real?.solidarity != null;

    if (phase !== this.lastPhase) {
      if (phase === Phase.Landed) {
        this.visited = false;
        setFamilyVisited(false);
      }
      // A week kept adds a boat as the shutters close; a season begun again clears them on its first morning.
      if (phase === Phase.Shut) this.countKeepsakes(true);
      if (phase === Phase.Morning) {
        this.countKeepsakes();
        this.keptAt = -1;
        this.answeredAt = -1;
        this.greetAt = GREET_AFTER;
      }
      if (phase === Phase.Shut) {
        if (this.boat != null) this.boat.visible = false;
        if (this.drawing != null) this.drawing.visible = false;
      }
      if (!VISITABLE.has(phase) && (this.mode === 'shown' || this.mode === 'coming')) this.leave();
      this.lastPhase = phase;
    }
    // Lina's drawing went with the crates once the van has gone.
    if (aid && aidSailed() && this.drawing != null && this.drawing.visible) this.drawing.visible = false;
    if (chosen !== this.lastChosen) {
      this.lastChosen = chosen;
      // What this week's choice brought into the room; nothing from other kinds of week.
      for (const [propsKind, props] of Object.entries(this.props)) {
        props.forEach((prop, index) => {
          prop.visible = !aid && propsKind === kind && index === chosen;
        });
      }
      if (this.mode !== 'away') this.drawFrames();
      // In a heat week the family's moment is Lina taking water to Dario (META_VR_FIKIR.md §19).
      const heat = weatherOf(week.getValue(Week, 'week') ?? 1)?.kind === 'heat';
      this.lineText = chosen === -2 ? '' : aid ? AID_LINE : heat ? HEAT_LINE : familyLine(kind, chosen);
      this.largeCaptions = largerCaptions();
      if (this.lineTexture != null) drawLine(this.lineTexture, this.lineText);
    }
    // Larger captions turned on or off on the start page: the line is drawn again at the new size.
    if (largerCaptions() !== this.largeCaptions) {
      this.largeCaptions = largerCaptions();
      if (this.lineTexture != null) drawLine(this.lineTexture, this.lineText);
    }
    // With less motion, the fading window's shaders are built once in the headset, before its first visit.
    if (lessMotion() && !this.fadingReady && this.renderer.xr.isPresenting) this.warmFading();

    if (this.mode === 'coming' || this.mode === 'going') {
      const held = this.boxEntity();
      if (held != null) this.world.getSystem(GrabSystem)?.forceRelease(held);
      this.time += delta;
      const t = Math.min(1, this.time / (this.fades ? FADE_SECONDS : FLIGHT));
      if (this.fades) {
        // Less motion: in the Keeper's window all along, only its opacity changes.
        this.setFade(this.mode === 'coming' ? t : 1 - t);
        if (t >= 1) this.endFade();
      } else {
        const e = t * t * (3 - 2 * t);
        const p = this.path.lerpVectors(this.from, this.to, e);
        p.y += ARC * Math.sin(Math.PI * t);
        const scale = this.mode === 'coming' ? START_SCALE + (BOX_SCALE - START_SCALE) * e : BOX_SCALE + (START_SCALE - BOX_SCALE) * e;
        this.place(p, scale, true);
      }
      if (t >= 1) {
        // Arrived in the Keeper's hands: the family's murmur, never words (SoundSystem).
        if (this.mode === 'coming') emitSignal('murmur');
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

    // Until they are visited after the basket lands, their little house on the sill's model glows with the window's invitation.
    const hint = phase === Phase.Landed && !this.visited && this.mode === 'away';
    const glow = hint ? 0.5 + 0.5 * Math.sin(this.elapsed * 2.6) : 0;
    (this.maquetteHouse?.material as MeshStandardMaterial | undefined)?.emissive.setRGB(0.32 * glow, 0.24 * glow, 0.1 * glow);
    this.awaitAnswer(week, phase, aid, delta);
    this.writeLight(week, phase, aid, delta);
  }

  /**
   * Lina's answer to the Sunday lamp (season/window-light.ts): once it is
   * lit, the town waits for the Keeper to look across; looking within 20
   * degrees of her window brings it, halfway through the wait her window
   * calls with two notes, and at the end she answers anyway. The latch
   * tried meanwhile brings it at once. The last week's lamp starts the last
   * night, so she answers as it lights.
   */
  private awaitAnswer(week: Entity, phase: string, aid: boolean, delta: number): void {
    const lit = phase === Phase.Sunday && (week.getValue(Week, 'lamp') ?? false);
    if (!lit) {
      if (this.waited >= 0) {
        this.waited = -1;
        setReply(0);
      }
      return;
    }
    if (this.answeredAt >= 0 || aid || this.target == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    if (this.waited < 0) {
      if (!replyHolds(n, SEASON_WEEKS, aid)) {
        this.answer('the last night');
        return;
      }
      this.waited = 0;
      this.called = false;
      setReply(1);
      if (import.meta.env.DEV) console.info(`[reply] waits, at most ${n <= 1 ? 12 : 6} s`);
      return;
    }
    this.waited += delta;
    // How far the Keeper's head is turned from her window.
    this.target.getWorldPosition(this.windowAt);
    this.player.head.getWorldPosition(this.headAt);
    this.player.head.getWorldQuaternion(this.headTurn);
    this.facing.set(0, 0, -1).applyQuaternion(this.headTurn);
    const look = (this.facing.angleTo(this.windowAt.sub(this.headAt)) * 180) / Math.PI;
    const step = replyStep(this.waited, n, look);
    if (step === 'answer') {
      this.answer(look <= REPLY_LOOK_DEGREES ? `a look across (${look.toFixed(0)} degrees)` : 'the wait running out');
    } else if (step === 'call' && !this.called) {
      // Her window calls: two notes from it, and the lamp's flame leans toward it (ToccoSystem), for a Keeper without sound.
      this.called = true;
      setReply(2);
      emitSignal('answer');
      if (import.meta.env.DEV) console.info(`[reply] calls after ${this.waited.toFixed(1)} s, head ${look.toFixed(0)} degrees from the window`);
    }
  }

  /** Lina's lamp rises in her window with her two notes (again, if her window called); Tocco and the latch go on. */
  private answer(why: string): void {
    if (import.meta.env.DEV) console.info(`[reply] answered after ${Math.max(0, this.waited).toFixed(1)} s, by ${why}`);
    this.answeredAt = this.elapsed;
    this.waited = -1;
    setReply(0);
    emitSignal('answer');
    this.called = false;
    emitSignal('answered');
  }

  /**
   * The window's warm light across the square, the one place its brightness
   * is written (season/window-light.ts decides it): added light, so it warms
   * the dark glass, strong enough to find among a hundred windows 25 m away.
   */
  private writeLight(week: Entity, phase: string, aid: boolean, delta: number): void {
    const f = this.facts;
    f.phase = phase;
    f.timer = week.getValue(Week, 'timer') ?? 0;
    // Tocco settles last week's call after a hush and a chime: the greeting waits until his line has been up a moment.
    if (phase === Phase.Morning && revealHeld() && f.timer < this.greetAt) this.greetAt = Math.max(this.greetAt, f.timer + GREET_AFTER_REVEAL);
    f.greetAt = this.greetAt;
    f.open = week.getValue(Week, 'shuttersOpen') ?? false;
    f.aid = aid;
    f.chosen = week.getValue(Week, 'chosen') ?? -1;
    f.visited = this.visited;
    f.helped = !aid && this.lastChosen === HELP;
    f.evening = evening.value;
    f.lamp = week.getValue(Week, 'lamp') ?? false;
    f.answered = this.answeredAt >= 0 ? this.elapsed - this.answeredAt : -1;
    f.kept = this.keptAt >= 0 ? this.elapsed - this.keptAt : -1;
    const state = windowState(f);
    if (state !== this.lightState) {
      if (import.meta.env.DEV) console.info(`[window] ${state} in ${phase}, ${f.timer.toFixed(1)} s into it`);
      // The greeting comes with the first four notes of Grandpa's waltz, from the window (SoundSystem).
      if (state === 'greet') emitSignal('greet');
      this.lightState = state;
    }
    const level = windowLevel(f);
    // Eased a little, so a change of state never jumps; the greeting's and farewell's rises still read.
    this.light += (level - this.light) * (1 - Math.exp(-12 * delta));
    setWindowLight(state, this.light);
    if (this.target != null) (this.target.material as MeshBasicMaterial).opacity = this.light;
  }

  /** One of Lina's paper boats on the Keeper's sill for each week this season the family was helped: they remember. */
  private countKeepsakes(onlyMore = false): void {
    if (this.keepsakes == null) return;
    const count = Math.min(KEEPSAKES, keptHelps());
    this.keepsakes.count = onlyMore ? Math.max(this.keepsakes.count, count) : count;
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
    if (week == null || !week.getValue(Week, 'shuttersOpen')) return;
    const visitable = (week.getValue(Week, 'week') ?? 1) === 1 ? FIRST_VISITABLE : VISITABLE;
    if (!visitable.has(week.getValue(Week, 'phase') ?? '')) return;
    if (this.mode !== 'away') return;
    this.mode = 'coming';
    this.time = 0;
    this.visited = true;
    setFamilyVisited(true);
    this.from.copy(this.home);
    this.to.copy(this.display);
    this.drawFrames();
    this.fades = lessMotion();
    if (this.fades) {
      this.place(this.display, BOX_SCALE, true);
      this.beginFade();
      this.setFade(0);
    }
  }

  /** The family's shadows for the week so far, with Lina's arm down and up. */
  private drawFrames(): void {
    // What goes to the harbour in a solidarity week brings nothing back to the family.
    const week = this.weekEntity();
    const aid = week != null && realWeek(week.getValue(Week, 'week') ?? 1)?.solidarity != null;
    this.frames.forEach((frame, index) => drawCurtain(frame, aid ? -1 : this.lastChosen, index === 1));
  }

  private leave(): void {
    const held = this.boxEntity();
    if (held != null) this.world.getSystem(GrabSystem)?.forceRelease(held);
    if (this.box == null || this.mode === 'away' || this.mode === 'going') return;
    if (this.mode === 'coming' && this.fades) {
      // Sent home while still fading in: it fades out from as far as it had come.
      this.time = FADE_SECONDS - Math.min(this.time, FADE_SECONDS);
    } else {
      this.time = 0;
      this.fades = lessMotion();
      if (this.fades) {
        this.beginFade();
        this.setFade(1);
      }
    }
    this.mode = 'going';
    this.from.copy(this.box.position);
    this.to.copy(this.home);
  }

  /**
   * Less motion: every mesh of the window (the room, the curtain, the props,
   * the glass, the hook, the line) gets a see-through copy of its material
   * to wear while it fades, made once; the glass and the line, already
   * see-through, fade as they are. Draw calls stay as they were.
   */
  private prepareFading(): void {
    if (this.fading.length > 0) return;
    const copies = new Map<Material, Material>();
    for (const object of [this.box, this.glass, this.hook, this.line]) {
      object?.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const own = mesh.material as Material;
        let fading = copies.get(own);
        if (fading == null) {
          fading = own.transparent ? own : seeThrough(own);
          copies.set(own, fading);
        }
        this.fading.push({ mesh, own, fading, opacity: own.opacity });
      });
    }
  }

  /** Builds the see-through copies' shaders now (in the headset, so its own variants), rather than in the frame the window first fades. */
  private warmFading(): void {
    this.fadingReady = true;
    this.prepareFading();
    for (const f of this.fading) f.mesh.material = f.fading;
    for (const object of [this.box, this.glass, this.hook, this.line]) {
      if (object != null) void this.renderer.compileAsync(object, this.world.camera, this.world.scene);
    }
    for (const f of this.fading) f.mesh.material = f.own;
    if (import.meta.env.DEV) console.info(`[family] less motion: ${this.fading.length} meshes of the window ready to fade`);
  }

  /** The window starts to fade: each mesh wears its see-through copy, with what changed while it was shown (the curtain's frame). */
  private beginFade(): void {
    this.prepareFading();
    for (const f of this.fading) {
      if (f.fading !== f.own) (f.fading as MeshBasicMaterial).map = (f.own as MeshBasicMaterial).map ?? null;
      f.mesh.material = f.fading;
    }
  }

  private setFade(amount: number): void {
    for (const f of this.fading) f.fading.opacity = f.opacity * amount;
  }

  /** Done fading: each mesh back in its own material, at its own opacity. */
  private endFade(): void {
    for (const f of this.fading) {
      f.fading.opacity = f.opacity;
      f.mesh.material = f.own;
    }
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
    this.box.position.copy(centre);
    this.box.scale.setScalar(s);
    this.box.visible = visible;
    placeRiders(centre, s, this.glassAt, this.hookAt, this.lineAt);
    // Pointer rays ignore visibility; parked over Tessa's window, the glass and the hook
    // would catch the pinch meant for the window, so away they go far below the town.
    const down = visible ? 0 : PARKED_DROP;
    if (this.glass != null) {
      this.glass.position.copy(this.glassAt);
      this.glass.position.y -= down;
      this.glass.scale.setScalar(s);
      this.glass.visible = visible;
    }
    if (this.hook != null) {
      this.hook.position.copy(this.hookAt);
      this.hook.position.y -= down;
      this.hook.scale.setScalar(s);
      this.hook.visible = visible;
    }
    if (this.line != null) {
      this.line.position.copy(this.lineAt);
      this.line.scale.setScalar(s / BOX_SCALE);
      this.line.visible = visible && this.lastChosen !== -2;
    }
  }
}

/**
 * A see-through copy of a material, for fading: the same shading (its
 * shader hooks too, which a plain copy leaves behind), drawn in the
 * transparent pass at the opacity it is given.
 */
function seeThrough(material: Material): Material {
  const copy = material.clone();
  copy.transparent = true;
  copy.onBeforeCompile = material.onBeforeCompile;
  copy.customProgramCacheKey = material.customProgramCacheKey;
  return copy;
}
