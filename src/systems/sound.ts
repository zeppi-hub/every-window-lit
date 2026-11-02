import { Audio, type AudioListener, AudioLoader, createSystem, type Entity, eq, Grabbed, type Object3D, PositionalAudio, Pressed, Vector3 } from '@iwsdk/core';
import { Phase, PokeButton, Week } from '../components.js';
import { aidCard } from '../aid.js';
import { onSignal, type SignalName } from '../signals.js';
import { stance } from '../stance.js';
import { EASE, EMPTY, levels, type RealWeek, type Town } from '../season/model.js';
import { EVERY_WINDOW } from '../season/lines.js';
import { currentTown, realWeek, solidarityOf } from '../season/store.js';
import { BASKET_ON_SQUARE } from '../station/basket.js';
import { PLAZA_Y, SILL } from '../station/layout.js';
import { hintTarget, wrongThing } from '../talk.js';
import { pullPitch } from '../week-locks.js';
import { festivalLit, festivalOn, festivalShare } from './festival.js';
import { OUTCOME_DAY } from './outcomes.js';

/**
 * The window's sound (META_VR_FIKIR.md §8). Interactions play short CC0
 * recordings from Kenney's audio packs (public/audio, CREDITS.md) where they
 * happen; the town's bed is made here with WebAudio, so it costs no files:
 * the sea and wind, distant traffic that thins in a dear fuel week, and the
 * market's murmur that thins with its stalls. The sea, the coast road and
 * the market each come from where they are, so turning the head toward one
 * brings it forward. With the shutters closed everything is muffled; down
 * on the square it is louder; outside the headset it is quiet. Words are always
 * written, never spoken. On the season's last night, if every window is
 * lit, Dario plays an accordion waltz at the family's window across the
 * square, made here too. The
 * sound starts with the first touch (Enter VR, or the latch).
 */

const FILES = [
  'metalLatch', 'doorOpen_1', 'doorClose_2', 'creak2', 'handleCoins', 'bookFlip1', 'dropLeather', 'chop',
  'metalClick', 'impactBell_heavy_000', 'impactGlass_light_001', 'impactPlank_medium_000', 'click_002',
] as const;
type Clip = (typeof FILES)[number];

/** Muffled through the closed shutters, open to the town. */
/** Playback rates for the conducted beats: a major pentatonic run, up an octave. */
const PENTATONIC = [1, 1.122, 1.26, 1.498, 1.682, 2] as const;
const SHUT_HZ = 700;
/** The hold-and-let-go tick never comes closer together than this (ms): a fingertip at an edge can take hold and let go every frame. */
const TICK_GAP_MS = 150;
const OPEN_HZ = 18000;
/** How loud each layer of the bed is, at a calm week with the shutters open. */
const SEA = 0.16;
const WIND = 0.05;
const TRAFFIC = 0.07;
const MARKET = 0.06;
/** Where the bed's layers come from (the wind is everywhere): the harbour's open sea, the coast road, the stalls. */
const SEA_AT = [-45, PLAZA_Y - 2, -70] as const;
const ROAD_AT = [-23.6, PLAZA_Y, -26] as const;
const MARKET_AT = [11.5, PLAZA_Y + 1, -17.6] as const;
/** The tower's signal bell, down on the square in front of the palazzo, heard across the town. */
const BELL_AT = [0.3, PLAZA_Y + 2.5, -5] as const;

export class SoundSystem extends createSystem({
  week: { required: [Week] },
  held: { required: [Grabbed] },
  /** Only the buttons that wait out a brush (the tower key): the others answer with their own sound at the touch. */
  waiting: { required: [PokeButton, Pressed], where: [eq(PokeButton, 'waits', true)] },
}) {
  private listener: AudioListener | null = null;
  private buffers = new Map<Clip, AudioBuffer>();
  private voices: PositionalAudio[] = [];
  /** Its own voice for the soft tick of taking hold and letting go, so the ticks never cut a longer sound short. */
  private tick: PositionalAudio | null = null;
  /**
   * When each kind of tick last played: taking hold (0), letting go (1), pressing a button that waits (2) and
   * lifting off it (3). Each kind is spaced on its own, so a quick tap gets both, and a brush on the key never
   * swallows the tick of the match taken just after.
   */
  private readonly tickedAt = [-Infinity, -Infinity, -Infinity, -Infinity];
  private flat: Audio | null = null;
  private next = 0;
  /** The next note of the conducted beats. */
  private beatNote = 0;
  private filter: BiquadFilterNode | null = null;
  private bed: { sea: GainNode; wind: GainNode; traffic: GainNode; market: GainNode } | null = null;
  private last = { phase: '', open: false, cutoff: -1, chosen: -1, keeperNotch: -1, card: 'none', real: null as RealWeek | null, town: null as Town | null, arrived: false, out: -1 };
  private place = new Vector3();
  private tune: Tune | null = null;
  /** Where the accordion plays from: Lina's window. */
  private tunePlace: PositionalAudio | null = null;
  /** The family's room: a soft murmur that comes from the room box while it is in the Keeper's hands. */
  private room: PositionalAudio | null = null;
  private roomGain: GainNode | null = null;
  private roomOn = false;
  private familyBox: Object3D | null = null;
  /** The bed's levels as last set, so a dip can come back to them. */
  private levels = { sea: 0, wind: 0, traffic: 0, market: 0 };
  /** One positional voice for Tocco's and the family's chatter, fed by a gain node. */
  private voice: PositionalAudio | null = null;
  private voiceIn: GainNode | null = null;
  private night = false;
  private earned = false;

  init(): void {
    this.listener = (this.player.head.children.find((c) => (c as Object3D & { type: string }).type === 'AudioListener') as AudioListener | undefined) ?? null;
    const listener = this.listener;
    if (listener == null) return;
    const loader = new AudioLoader();
    for (const name of FILES) loader.load(`./audio/${name}.ogg`, (buffer) => this.buffers.set(name, buffer));
    // A few positional voices, reused in turn, and one flat one for the room.
    for (let i = 0; i < 6; i += 1) {
      const voice = new PositionalAudio(listener);
      voice.setRefDistance(0.6);
      voice.setRolloffFactor(1.2);
      this.world.createTransformEntity(voice, { persistent: true });
      this.voices.push(voice);
    }
    this.tick = new PositionalAudio(listener);
    this.tick.setRefDistance(0.4);
    this.tick.setRolloffFactor(1.2);
    this.world.createTransformEntity(this.tick, { persistent: true });
    this.flat = new Audio(listener);
    this.voice = new PositionalAudio(listener);
    this.voice.setRefDistance(0.6);
    this.voice.setRolloffFactor(1);
    this.world.createTransformEntity(this.voice, { persistent: true });
    this.voiceIn = listener.context.createGain();
    this.voice.setNodeSource(this.voiceIn as unknown as AudioBufferSourceNode);
    const context = listener.context;
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = SHUT_HZ;
    listener.setFilter(this.filter);
    // The sea, road and market are placed in the town; the wind goes straight to the ears.
    const from = ([x, y, z]: readonly [number, number, number]): AudioNode => {
      const source = new PositionalAudio(listener);
      source.position.set(x, y, z);
      // Full loudness out to about four fifths of the way from the seat, so the seat hears it well and the square no louder.
      const eye = this.place.set(x, y - (PLAZA_Y + 9.5), z).length();
      source.setRefDistance(0.8 * eye);
      source.setRolloffFactor(1);
      this.world.createTransformEntity(source, { persistent: true });
      const into = context.createGain();
      source.setNodeSource(into as unknown as AudioBufferSourceNode);
      return into;
    };
    this.bed = makeBed(context, { sea: from(SEA_AT), wind: listener.getInput(), traffic: from(ROAD_AT), market: from(MARKET_AT) });
    // The family's room tone: close to the box it is clear, leaning in brings it up (META_VR_DINAMIKLER.md item 17).
    this.room = new PositionalAudio(listener);
    this.room.setRefDistance(0.22);
    this.room.setRolloffFactor(2.2);
    this.world.createTransformEntity(this.room, { persistent: true });
    this.roomGain = context.createGain();
    this.roomGain.gain.value = 0;
    this.room.setNodeSource(this.roomGain as unknown as AudioBufferSourceNode);
    roomTone(context, this.roomGain);

    // The first touch wakes the sound; browsers keep it asleep until then.
    const wake = () => {
      if (context.state === 'suspended') void context.resume();
    };
    // Entering the headset also readies the accordion at Lina's window, so its first notes never wait on a build.
    const enter = () => {
      wake();
      this.prepareTune();
    };
    window.addEventListener('pointerdown', wake);
    this.renderer.xr.addEventListener('sessionstart', enter);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', wake),
      () => this.renderer.xr.removeEventListener('sessionstart', enter),
      // Lina's window greets the Keeper with the first four notes of Grandpa's waltz; it answers the lamp with two.
      onSignal('greet', () => this.motif(4)),
      onSignal('answer', () => this.motif(2)),
      onSignal('say', () => this.chatter('Tocco', 4, 520, 0.16, 0.085)),
      // Taking hold of anything, and letting it go, answers at once with a soft tick from the thing itself; what the
      // hold leads to (the latch's clack, the rope's creak) still has its own sound.
      this.queries.held.subscribe('qualify', (entity) => this.touched(entity.object3D, 1.15, 0)),
      this.queries.held.subscribe('disqualify', (entity) => this.touched(entity.object3D, 0.85, 1)),
      // The key counts only after the touch, but the touch is answered at once: the same soft tick, then a lower one
      // as the finger lifts.
      this.queries.waiting.subscribe('qualify', (entity) => this.touched(entity.object3D, 1.15, 2)),
      this.queries.waiting.subscribe('disqualify', (entity) => this.touched(entity.object3D, 0.85, 3)),
      // The next thing to touch ticks softly where it is; something new on the sill arrives with a small chime.
      onSignal('hint', () => {
        const target = hintTarget();
        if (target == null) return;
        this.locate(target);
        this.sound('click_002', 0.5, 0.6);
      }),
      onSignal('coin', () => this.at('CoinJar', 'handleCoins', 0.6)),
      onSignal('gauge', () => this.at('Gauges', 'metalClick', 0.35)),
      onSignal('strike', () => this.scratch()),
      // Tocco's little hammer on the sill, and his hand meeting the Keeper's.
      onSignal('tap', () => this.at('Tocco', 'impactPlank_medium_000', 0.25)),
      // The morning's held breath: the square's sound dips for two seconds, then a soft chime before last week's answer.
      onSignal('hush', () => this.duck(2)),
      onSignal('crumbs', () => this.at('CrumbBag', 'bookFlip1', 0.5)),
      // The spyglass settling at the eye: its brass sections meeting.
      onSignal('spy', () => this.at('Spyglass', 'metalClick', 0.3)),
      // Each conducted beat: the next note up a pentatonic scale, from the lights over the square.
      onSignal('beat', () => {
        const object = this.world.scene.getObjectByName('FestivalBulbs');
        if (object != null) this.locate(object);
        this.sound('impactGlass_light_001', 0.7, 6, PENTATONIC[this.beatNote % PENTATONIC.length]);
        this.beatNote += 1;
      }),
      onSignal('lit', () => {
        this.beatNote = 0;
      }),
      onSignal('restart', () => this.restart()),
      onSignal('chime', () => this.at('Tocco', 'impactGlass_light_001', 0.6)),
      onSignal('slap', () => this.at('Tocco', 'click_002', 0.8)),
      onSignal('reveal', () => this.atPoint(0, SILL.top + 0.05, -0.35, 'impactGlass_light_001', 0.35, 0.6)),
      onSignal('murmur', () => this.chatter('FamilyBox', 6, 250, 0.09, 0.13)),
      onSignal('latch', () => {
        wake();
        this.at('Latch', 'metalLatch', 0.8);
      }),
      // Each haul on the rope that counts creaks the pulley a little higher than the last, so the count is heard.
      onSignal('pulled', () => {
        const pulls = this.weekEntity()?.getValue(Week, 'pulls') ?? 1;
        if (import.meta.env.DEV) console.info(`[sound] haul ${pulls} creaks at ${pullPitch(pulls)}x, ${(performance.now() / 1000).toFixed(3)} s`);
        this.at('RopeToggleMesh', 'creak2', 0.7, pullPitch(pulls));
      }),
      // Touched out of turn (week-locks.ts): a dull knock from the thing itself.
      onSignal('wrong', () => {
        const name = wrongThing();
        if (import.meta.env.DEV) console.info(`[sound] dull knock at ${name}, ${(performance.now() / 1000).toFixed(3)} s`);
        if (name !== '') this.at(name, 'impactPlank_medium_000', 0.45, 0.55);
      }),
      ...(
        [
          ['brake', 'BrakeLever', 'metalClick', 0.7],
          ['knock', 'FamilyGlass', 'impactGlass_light_001', 0.8],
          ['lamp', 'SundayLamp', 'metalClick', 0.5],
          ['up', 'ArrowUp', 'click_002', 0.6],
          ['down', 'ArrowDown', 'click_002', 0.6],
          ['tocco', 'Tocco', 'click_002', 0.4],
          // The key turning as the Keeper goes down the stairs; the tower door as they come back in (once per climb,
          // however often the ring is touched meanwhile, WalkSystem).
          ['descend', 'TowerKey', 'metalClick', 0.6],
          ['climb', 'TowerDoorRing', 'doorOpen_1', 0.6],
        ] as const
      ).map(([signal, at, clip, gain]) => onSignal(signal as SignalName, () => this.at(at, clip, gain))),
    );
  }

  update(): void {
    const week = this.weekEntity();
    if (week == null || this.listener == null) return;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const open = week.getValue(Week, 'shuttersOpen') ?? false;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const context = this.listener.context;

    // The shutters: a creak as they swing, and the town comes through once they are open, or once the Keeper is down in it.
    if (open !== this.last.open) {
      this.last.open = open;
      this.at('Latch', open ? 'doorOpen_1' : 'doorClose_2', 0.6);
    }
    const cutoff = open || stance() === 'walk' ? OPEN_HZ : SHUT_HZ;
    if (cutoff !== this.last.cutoff) {
      this.last.cutoff = cutoff;
      this.filter?.frequency.setTargetAtTime(cutoff, context.currentTime, 0.35);
    }
    if (phase !== this.last.phase) {
      this.onPhase(phase, chosen, solidarityOf(week.getValue(Week, 'week') ?? 1) != null);
      this.last.phase = phase;
    }
    if (phase === Phase.Choosing && chosen !== this.last.chosen && chosen >= 0) this.at('Basket', 'dropLeather', 0.7);
    this.last.chosen = chosen;
    const notches = currentTown().keeperNotches + currentTown().toccoNotches;
    if (this.last.keeperNotch >= 0 && notches > this.last.keeperNotch) this.at('Latch', 'chop', 0.5);
    this.last.keeperNotch = notches;

    // The solidarity week's second basket brings its card: the paper sounds as it reaches the sill.
    const card = aidCard();
    if (card !== this.last.card) {
      if (card === 'sill') this.at('WeekCard', 'bookFlip1', 0.4);
      this.last.card = card;
    }
    this.tuneBed(week, open, context.currentTime);
    this.waltz(context);
    this.familyRoom(context.currentTime);
  }

  /**
   * The season starts over from the start page, the week put back where a
   * fresh load starts it: taken as already heard, so going back makes no
   * sound of its own (no shutters closing, no paper, no carving).
   */
  restart(): void {
    this.last.open = false;
    this.last.phase = Phase.Shut;
    this.last.chosen = -1;
    this.last.keeperNotch = -1;
    this.last.card = 'none';
    this.beatNote = 0;
    // The last night is over: the town has not earned the waltz again, and an accordion still playing stops at once.
    this.night = false;
    this.earned = false;
    const tune = this.tune;
    const context = this.listener?.context;
    if (tune != null && context != null) {
      const now = context.currentTime;
      if (import.meta.env.DEV) console.info(`[sound] restart: the waltz ${tune.on ? 'stops' : 'stays silent'}, its fade cut at ${(performance.now() / 1000).toFixed(2)} s`);
      tune.on = false;
      for (const gain of [tune.level, tune.reedGain, tune.bassGain, tune.chordGain]) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
      }
      tune.note = 0;
      tune.beat = 0;
      tune.noteLeft = 0;
    }
  }

  /** Dario's waltz on the last night, if the town earned it; built the first time, then only rescheduled. */
  private waltz(context: AudioContext): void {
    // Whether the town earned the tune is worked out once, as the night begins.
    const night = festivalOn();
    if (night !== this.night) {
      this.night = night;
      // Each last night's conducted notes start from the bottom of the scale.
      this.beatNote = 0;
      this.earned = night && festivalShare() >= EVERY_WINDOW;
    }
    // The tune starts once the conducted windows are all on; only in the headset (back on the start page it fades).
    const playing = this.earned && festivalLit() && context.state === 'running' && this.renderer.xr.isPresenting;
    if (playing) this.prepareTune();
    const tune = this.tune;
    if (tune == null) return;
    if (playing !== tune.on) {
      if (import.meta.env.DEV) console.info(`[sound] waltz ${playing ? 'plays' : 'fades'} at ${(performance.now() / 1000).toFixed(2)} s, ${this.renderer.xr.isPresenting ? 'in the headset' : 'on the start page'}`);
      tune.on = playing;
      tune.level.gain.setTargetAtTime(playing ? 0.5 : 0, context.currentTime, playing ? 0.6 : 1.2);
      if (playing) tune.next = context.currentTime + 0.3;
    }
    if (tune.on) scheduleTune(tune, context.currentTime);
  }

  private weekEntity(): Entity | null {
    for (const entity of this.queries.week.entities) return entity;
    return null;
  }

  /** The accordion at Lina's window, built once (on entering the headset): Grandpa is heard, never seen (META_VR_FIKIR.md §3). */
  private prepareTune(): void {
    if (this.tune != null || this.listener == null) return;
    const at = new PositionalAudio(this.listener);
    this.world.scene.getObjectByName('TessaWindow')?.getWorldPosition(at.position);
    at.setRefDistance(8);
    at.setRolloffFactor(0.6);
    this.world.createTransformEntity(at, { persistent: true });
    this.tune = makeTune(this.listener.context, at);
    this.tunePlace = at;
    if (import.meta.env.DEV) console.info(`[sound] accordion ready at Lina's window, ${this.renderer.xr.isPresenting ? 'entering the headset' : 'outside it'}`);
  }

  /** The first `count` notes of Grandpa's waltz from Lina's window: the greeting's four, the answer's two. Never over the waltz itself. */
  private motif(count: number): void {
    const context = this.listener?.context;
    this.prepareTune();
    const tune = this.tune;
    if (context == null || tune == null || tune.on || context.state !== 'running') return;
    if (import.meta.env.DEV) {
      const p = this.tunePlace?.position;
      console.info(`[sound] motif, ${count} notes (${MELODY.slice(0, count).map(([midi]) => midi).join(' ')}) from ${p?.x.toFixed(1)} ${p?.y.toFixed(1)} ${p?.z.toFixed(1)}`);
    }
    playMotif(tune, count, context.currentTime);
  }

  private onPhase(phase: string, chosen: number, aid: boolean): void {
    switch (phase) {
      case Phase.Bell:
        // The bell rings below; never in a solidarity week, when the neighbours haul the basket up instead.
        if (!aid) {
          this.atPoint(BELL_AT[0], BELL_AT[1], BELL_AT[2], 'impactBell_heavy_000', 0.9, 9);
          // The rope beside the window creaks as it twitches (BasketSystem), so the ear finds it too.
          this.at('RopeToggleMesh', 'creak2', 0.45);
        }
        break;
      case Phase.Rising:
        this.at('Basket', 'bookFlip1', 0.4);
        break;
      case Phase.Choosing:
        this.at('Basket', 'impactPlank_medium_000', 0.6);
        break;
      case Phase.Landed:
        // The basket touching down on the square, loud enough to carry up to the window.
        this.atPoint(BASKET_ON_SQUARE.x, BASKET_ON_SQUARE.y + 0.3, BASKET_ON_SQUARE.z, 'impactPlank_medium_000', 0.9, 7);
        break;
      case Phase.Lowering:
        this.at('RopeToggleMesh', 'creak2', 0.5);
        // Nothing is paid in a solidarity week.
        if (chosen >= 0 && !aid) this.at('CoinJar', 'handleCoins', 0.6);
        break;
      default:
        break;
    }
  }

  /** The bed follows the week: traffic with the cars at the kerb, the market with its stalls; louder on the square, silent outside the headset. */
  private tuneBed(week: Entity, open: boolean, now: number): void {
    const bed = this.bed;
    if (bed == null) return;
    const real = realWeek(week.getValue(Week, 'week') ?? 1);
    const town = currentTown();
    const out = !this.renderer.xr.isPresenting ? 0 : stance() === 'walk' ? 1.6 : open ? 1 : 0.55;
    // As in the town (TownSystem): easing a dear week brings the cars and stalls back from its outcome evening.
    const phase = week.getValue(Week, 'phase');
    const arrived =
      (phase === Phase.Days || phase === Phase.Sunday) &&
      week.getValue(Week, 'chosen') === EASE &&
      (week.getValue(Week, 'day') ?? -1) >= (OUTCOME_DAY[EASE] ?? 7);
    // Worked out again only when the week, the town, the easing or where the Keeper is changes.
    if (real === this.last.real && town === this.last.town && arrived === this.last.arrived && out === this.last.out) return;
    this.last.real = real;
    this.last.town = town;
    this.last.arrived = arrived;
    this.last.out = out;
    const shown = real != null ? levels(real, town, arrived ? EASE : EMPTY) : { fuel: 0, power: 0, food: 0 };
    const traffic = TRAFFIC * (1 - 0.22 * Math.max(0, shown.fuel)) * (shown.fuel < 0 ? 1.25 : 1);
    const market = MARKET * (1 - 0.25 * Math.max(0, shown.food));
    this.levels.sea = SEA * out;
    this.levels.wind = WIND * out;
    this.levels.traffic = traffic * out;
    this.levels.market = market * out;
    bed.sea.gain.setTargetAtTime(this.levels.sea, now, 0.5);
    bed.wind.gain.setTargetAtTime(this.levels.wind, now, 0.5);
    bed.traffic.gain.setTargetAtTime(this.levels.traffic, now, 0.8);
    bed.market.gain.setTargetAtTime(this.levels.market, now, 0.8);
  }

  /** Plays a clip where a named thing is (its geometry's middle, since many meshes carry world coordinates). */
  private at(name: string, clip: Clip, gain: number, rate = 1): void {
    const object = this.world.scene.getObjectByName(name);
    if (object == null) return;
    this.locate(object);
    this.sound(clip, gain, 0.6, rate);
  }

  /**
   * A voice without words: `count` short pitched taps at a named thing, made
   * here (wooden clicks for Tocco, a softer, lower murmur for the family).
   * Event-driven, a handful of nodes each time; they free themselves.
   */
  private chatter(name: string, count: number, pitch: number, gain: number, spacing: number): void {
    const listener = this.listener;
    if (listener == null || listener.context.state !== 'running' || this.voice == null) return;
    const object = this.world.scene.getObjectByName(name);
    if (object == null) return;
    this.locate(object);
    this.voice.position.copy(this.place);
    const context = listener.context;
    let t = context.currentTime + 0.02;
    for (let i = 0; i < count; i += 1) {
      const o = context.createOscillator();
      o.type = 'triangle';
      const f = pitch * (0.85 + Math.random() * 0.4);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.72, t + 0.07);
      const g = context.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
      o.connect(g).connect(this.voiceIn as GainNode);
      o.start(t);
      o.stop(t + 0.1);
      t += spacing * (0.75 + Math.random() * 0.5);
    }
  }

  /** The family's room tone follows the box while it is shown, and fades when it goes home. */
  private familyRoom(now: number): void {
    const room = this.room;
    if (room == null || this.roomGain == null) return;
    const box = this.familyBox ?? (this.familyBox = this.world.scene.getObjectByName('FamilyBox') ?? null);
    const on = box?.visible ?? false;
    if (on && box != null) box.getWorldPosition(room.position);
    if (on === this.roomOn) return;
    this.roomOn = on;
    this.roomGain.gain.setTargetAtTime(on ? 0.12 : 0, now, on ? 0.4 : 0.25);
  }

  /** The town holds its breath: the bed dips to a quarter for `seconds`, then comes back. */
  private duck(seconds: number): void {
    const bed = this.bed;
    if (bed == null || this.listener == null) return;
    const now = this.listener.context.currentTime;
    for (const key of ['sea', 'wind', 'traffic', 'market'] as const) {
      const gain = bed[key].gain;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(this.levels[key] * 0.25, now, 0.25);
      gain.setTargetAtTime(this.levels[key], now + seconds, 0.6);
    }
  }

  /** A match drawn across its box: a short rasp of filtered noise at the matchbox, then the hiss of the flame. */
  private scratch(): void {
    const listener = this.listener;
    if (listener == null || listener.context.state !== 'running' || this.voice == null || this.voiceIn == null) return;
    const object = this.world.scene.getObjectByName('Matchbox');
    if (object == null) return;
    this.locate(object);
    this.voice.position.copy(this.place);
    const context = listener.context;
    const length = Math.floor(context.sampleRate * 0.5);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.8;
    const gain = context.createGain();
    const t = context.currentTime + 0.01;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.18);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
    source.connect(filter).connect(gain).connect(this.voiceIn);
    source.start(t);
    source.stop(t + 0.5);
  }

  /** Where a named thing is: its world position, or its geometry's middle for meshes built in world coordinates. */
  private locate(object: Object3D): void {
    object.getWorldPosition(this.place);
    if (this.place.lengthSq() < 1e-6) {
      const geometry = (object as Object3D & { geometry?: { boundingSphere: { center: Vector3 } | null; computeBoundingSphere: () => void } }).geometry;
      if (geometry != null) {
        if (geometry.boundingSphere == null) geometry.computeBoundingSphere();
        if (geometry.boundingSphere != null) this.place.copy(geometry.boundingSphere.center);
      }
    }
  }

  /** The soft tick of a hand taking hold of or pressing (higher), or letting go of or lifting off (lower), a thing. */
  private touched(object: Object3D | undefined, rate: number, kind: 0 | 1 | 2 | 3): void {
    const voice = this.tick;
    const buffer = this.buffers.get('click_002');
    if (object == null || voice == null || buffer == null || this.listener?.context.state !== 'running') return;
    const now = performance.now();
    if (now - this.tickedAt[kind] < TICK_GAP_MS) return;
    this.tickedAt[kind] = now;
    this.locate(object);
    if (voice.isPlaying) voice.stop();
    voice.position.copy(this.place);
    voice.setBuffer(buffer);
    voice.setVolume(0.22);
    voice.setPlaybackRate(rate);
    voice.play();
    if (import.meta.env.DEV && kind >= 2) console.info(`[sound] ${kind === 2 ? 'press' : 'lift'} tick at ${object.name} at ${now.toFixed(1)} ms`);
  }

  private atPoint(x: number, y: number, z: number, clip: Clip, gain: number, ref: number): void {
    this.place.set(x, y, z);
    this.sound(clip, gain, ref);
  }

  private sound(clip: Clip, gain: number, ref: number, rate = 1): void {
    const buffer = this.buffers.get(clip);
    if (buffer == null || this.listener == null || this.listener.context.state !== 'running') return;
    const voice = this.voices[this.next];
    this.next = (this.next + 1) % this.voices.length;
    if (voice.isPlaying) voice.stop();
    voice.position.copy(this.place);
    voice.setRefDistance(ref);
    voice.setBuffer(buffer);
    voice.setVolume(gain);
    voice.setPlaybackRate(rate);
    voice.play();
  }
}

/** Noise loops filtered into sea, wind, traffic and market layers, each with its own gain and destination; started once, run quietly. */
function makeBed(
  context: AudioContext,
  into: { sea: AudioNode; wind: AudioNode; traffic: AudioNode; market: AudioNode },
): { sea: GainNode; wind: GainNode; traffic: GainNode; market: GainNode } {
  const noise = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
  const data = noise.getChannelData(0);
  // Brown-ish noise: a random walk, kept centred.
  let walk = 0;
  for (let i = 0; i < data.length; i += 1) {
    walk = (walk + (Math.random() * 2 - 1) * 0.04) * 0.996;
    data[i] = walk * 3;
  }
  const layer = (type: BiquadFilterType, frequency: number, q: number, wobbleHz: number, wobble: number, to: AudioNode): GainNode => {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    // A slow swell, like waves or gusts.
    const swell = context.createGain();
    swell.gain.value = 1 - wobble;
    const lfo = context.createOscillator();
    lfo.frequency.value = wobbleHz;
    const depth = context.createGain();
    depth.gain.value = wobble;
    lfo.connect(depth).connect(swell.gain);
    const level = context.createGain();
    level.gain.value = 0;
    source.connect(filter).connect(swell).connect(level).connect(to);
    source.start();
    lfo.start();
    return level;
  };
  return {
    sea: layer('lowpass', 420, 0.7, 0.11, 0.45, into.sea),
    wind: layer('bandpass', 900, 0.6, 0.05, 0.6, into.wind),
    traffic: layer('lowpass', 160, 1.2, 0.2, 0.2, into.traffic),
    market: layer('bandpass', 650, 2.2, 1.7, 0.35, into.market),
  };
}

/**
 * Dario's waltz: an original tune in G, three beats to the bar. The
 * accordion is two sawtooth reeds tuned a hair apart (the musette's beat)
 * through a soft filter, over the left hand's bass and two-beat chords.
 */
const BEAT = 60 / 132;
/** The melody, as [MIDI note, beats]; sixteen bars. */
const MELODY: ReadonlyArray<readonly [number, number]> = [
  [71, 1], [74, 1], [79, 1], [78, 2], [76, 1], [74, 1], [72, 1], [69, 1], [66, 3],
  [69, 1], [72, 1], [78, 1], [76, 2], [74, 1], [74, 1], [71, 1], [67, 1], [67, 3],
  [76, 1], [79, 1], [76, 1], [74, 1], [72, 1], [76, 1], [74, 1], [71, 1], [67, 1], [71, 2], [74, 1],
  [72, 1], [71, 1], [69, 1], [78, 1], [76, 1], [74, 1], [69, 1], [66, 1], [69, 1], [67, 3],
];
/** Each bar's chord: bass root on the first beat, the chord on the other two. */
const CHORDS = { G: [43, [55, 59, 62]], D: [38, [54, 57, 62]], C: [48, [55, 60, 64]] } as const;
const BARS: ReadonlyArray<keyof typeof CHORDS> = ['G', 'G', 'D', 'D', 'D', 'D', 'G', 'G', 'C', 'C', 'G', 'G', 'D', 'D', 'D', 'G'];

interface Tune {
  on: boolean;
  level: GainNode;
  reeds: OscillatorNode[];
  reedGain: GainNode;
  bass: OscillatorNode;
  bassGain: GainNode;
  chord: OscillatorNode[];
  chordGain: GainNode;
  /** When the next note starts (audio clock), and where the melody and bars are. */
  next: number;
  note: number;
  beat: number;
  noteLeft: number;
}

function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function makeTune(context: AudioContext, at: PositionalAudio): Tune {
  const level = context.createGain();
  level.gain.value = 0;
  at.setNodeSource(level as unknown as AudioBufferSourceNode);
  const voice = (type: OscillatorType, count: number, filterHz: number, into: AudioNode) => {
    const gain = context.createGain();
    gain.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    gain.connect(filter).connect(into);
    const oscillators = Array.from({ length: count }, () => {
      const o = context.createOscillator();
      o.type = type;
      o.connect(gain);
      o.start();
      return o;
    });
    return { gain, oscillators };
  };
  const reeds = voice('sawtooth', 2, 2400, level);
  reeds.oscillators[1].detune.value = 9;
  const bass = voice('triangle', 1, 600, level);
  const chord = voice('square', 3, 1400, level);
  return {
    on: false,
    level,
    reeds: reeds.oscillators,
    reedGain: reeds.gain,
    bass: bass.oscillators[0],
    bassGain: bass.gain,
    chord: chord.oscillators,
    chordGain: chord.gain,
    next: 0,
    note: 0,
    beat: 0,
    noteLeft: 0,
  };
}

/** How loud the window's motif plays (the waltz plays at 0.5, with its left hand under it). */
const MOTIF_LEVEL = 0.8;

/**
 * The first `count` notes of the waltz's melody on the accordion's reeds
 * alone, starting now, then silence: the window's greeting (four) and its
 * answer to the lamp (two).
 */
function playMotif(tune: Tune, count: number, now: number): void {
  let t = now + 0.05;
  tune.level.gain.cancelScheduledValues(now);
  tune.reedGain.gain.cancelScheduledValues(now);
  // The answer can follow the call's two notes before they end: it starts over, never mixing their pitches.
  for (const reed of tune.reeds) reed.frequency.cancelScheduledValues(now);
  tune.level.gain.setTargetAtTime(MOTIF_LEVEL, now, 0.02);
  for (let i = 0; i < count; i += 1) {
    const [midi, beats] = MELODY[i];
    for (const reed of tune.reeds) reed.frequency.setValueAtTime(hz(midi), t);
    tune.reedGain.gain.setTargetAtTime(0.16, t, 0.02);
    tune.reedGain.gain.setTargetAtTime(0.1, t + 0.08, 0.15);
    t += beats * BEAT;
    tune.reedGain.gain.setTargetAtTime(i === count - 1 ? 0 : 0.02, t - 0.07, i === count - 1 ? 0.08 : 0.02);
  }
  tune.level.gain.setTargetAtTime(0, t + 0.4, 0.1);
}

/** Schedules the beats due in the next quarter second; the melody and the left hand step together, beat by beat. */
function scheduleTune(tune: Tune, now: number): void {
  // Fell behind (the tab slept): pick up from now.
  if (tune.next < now - 0.5) tune.next = now + 0.05;
  while (tune.next < now + 0.25) {
    const t = tune.next;
    if (tune.noteLeft <= 0) {
      const [midi, beats] = MELODY[tune.note];
      tune.note = (tune.note + 1) % MELODY.length;
      tune.noteLeft = beats;
      for (const reed of tune.reeds) reed.frequency.setValueAtTime(hz(midi), t);
      tune.reedGain.gain.setTargetAtTime(0.16, t, 0.02);
      tune.reedGain.gain.setTargetAtTime(0.1, t + 0.08, 0.15);
      tune.reedGain.gain.setTargetAtTime(0.02, t + beats * BEAT - 0.07, 0.02);
    }
    tune.noteLeft -= 1;
    const bar = Math.floor(tune.beat / 3) % BARS.length;
    const [root, notes] = CHORDS[BARS[bar]];
    if (tune.beat % 3 === 0) {
      tune.bass.frequency.setValueAtTime(hz(root), t);
      tune.bassGain.gain.setTargetAtTime(0.22, t, 0.01);
      tune.bassGain.gain.setTargetAtTime(0, t + BEAT * 0.55, 0.06);
    } else {
      tune.chord.forEach((o, i) => o.frequency.setValueAtTime(hz(notes[i]), t));
      tune.chordGain.gain.setTargetAtTime(0.045, t, 0.01);
      tune.chordGain.gain.setTargetAtTime(0, t + BEAT * 0.4, 0.05);
    }
    tune.beat = (tune.beat + 1) % (BARS.length * 3);
    tune.next += BEAT;
  }
}

/** A quiet room: a low murmur of voices and a kettle's faint hiss, from filtered noise with a slow sway; started once, gated by `into`. */
function roomTone(context: AudioContext, into: AudioNode): void {
  const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const voices = context.createBufferSource();
  voices.buffer = noise;
  voices.loop = true;
  const low = context.createBiquadFilter();
  low.type = 'bandpass';
  low.frequency.value = 320;
  low.Q.value = 3;
  // Voices rise and fall a few times a second, like talk heard through a wall.
  const sway = context.createGain();
  sway.gain.value = 0.6;
  const lfo = context.createOscillator();
  lfo.frequency.value = 2.7;
  const depth = context.createGain();
  depth.gain.value = 0.4;
  lfo.connect(depth).connect(sway.gain);
  const hiss = context.createBufferSource();
  hiss.buffer = noise;
  hiss.loop = true;
  hiss.playbackRate.value = 1.3;
  const high = context.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 5200;
  const hissLevel = context.createGain();
  hissLevel.gain.value = 0.08;
  voices.connect(low).connect(sway).connect(into);
  hiss.connect(high).connect(hissLevel).connect(into);
  voices.start();
  hiss.start();
  lfo.start();
}
