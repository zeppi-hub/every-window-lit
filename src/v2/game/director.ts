import { createSystem, Group, InputComponent, type Mesh, type Object3D, Quaternion, Ray, Sphere, Vector3 } from '@iwsdk/core';
import { pinchPoint, pinchTarget } from '../../systems/pinch-reach.js';
import { onV2 } from '../events.js';
import { setV2Targets } from '../step-targets.js';
import { CloudBear, Falls, GoldWords, Paper, Rain } from './fx.js';
import { GhostHand } from './ghost.js';
import { Sounds } from './sound.js';
import type { PersonaId } from './lines.js';
import { People } from './people.js';
import { Rig } from './rig.js';
import { Captions } from './say.js';
import { Stage } from './stage.js';

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];
/** A perch is taken by a pinch with the ray through this sphere round it, or the pinch point (or a controller's grip) this near (m). */
const PERCH_RAY = 0.22;
const PERCH_NEAR = 0.14;
const UP = new Vector3(0, 1, 0);

/** The day's state (META_VR_V2_TASARIM.md, "Durum değişkenleri"). */
export interface DayState {
  persona: PersonaId | null;
  /** 1-6: run, coldFire, sinkingBank, fog, drought, wolves. */
  problem: number;
  darkWindows: number;
  bearStep: number;
  treasury: number;
  wrongStreak: number;
}

/**
 * The new version's director: it owns the places, the people, the
 * captions, the effects and the player's seat, steps them every frame, and
 * gives the scene scripts (v2/game/opening.ts and the rest) their few
 * verbs: wait, wait until, say a line, take a perch, wait for a word.
 * The scripts run as async functions; every wait resolves from update().
 */
export class DirectorSystem extends createSystem({}) {
  stage!: Stage;
  rig!: Rig;
  people!: People;
  captions!: Captions;
  rain!: Rain;
  loaves!: Falls;
  gold!: GoldWords;
  bear!: CloudBear;
  notebook!: Paper;
  newspaper!: Paper;
  ghost!: GhostHand;
  sounds!: Sounds;
  readonly day: DayState = { persona: null, problem: 1, darkWindows: 0, bearStep: 0, treasury: 6, wrongStreak: 0 };
  private time = 0;
  private timers: { at: number; done: () => void }[] = [];
  private conditions: { test: () => boolean; done: () => void }[] = [];
  private perches: Object3D[] = [];
  private perchDone: ((index: number) => void) | null = null;
  private wordDone: ((word: string) => void) | null = null;
  /** The scenes' per-frame work (a falling acrobat, a net following its rope), run before everything else is drawn. */
  private readonly frames = new Set<(delta: number) => void>();
  /** Dev only (key 7): what each wait does when skipped. */
  private skips: (() => void)[] = [];
  private readonly eye = new Vector3();
  private readonly ray = new Ray();
  private readonly sphere = new Sphere();
  private readonly turn = new Quaternion();
  private readonly at = new Vector3();

  init(): void {
    this.stage = new Stage(this.world);
    this.rig = new Rig(this.player, this.player.head);
    this.people = new People(this.world);
    this.captions = new Captions(this.world);
    this.rain = new Rain(this.world);
    this.loaves = new Falls(this.world, 0xb98a4e, { x: 0.13, y: 0.07, z: 0.08 });
    this.gold = new GoldWords(this.world);
    this.bear = new CloudBear(this.world, new Vector3(-10, 42, 70), new Vector3(0, 25, 0));
    this.notebook = new Paper(this.world, { w: 0.3, h: 0.36 }, 'ClippingsNotebook');
    this.newspaper = new Paper(this.world, { w: 0.42, h: 0.3 }, 'Newspaper');
    this.ghost = new GhostHand(this.world);
    this.sounds = new Sounds(this.player.head);
    this.ghost.entityOf = (object) => {
      const index = (object as { entityIdx?: number }).entityIdx;
      return index == null ? null : this.world.entityManager.getEntityByIndex(index);
    };
    // The wing: low on the left, a little forward (parrot-system.ts WING_AT), turned with the head's heading.
    const wing = new Vector3();
    this.ghost.wingFrom = () => {
      this.player.head.getWorldQuaternion(this.turn);
      const yaw = Math.atan2(-2 * (this.turn.x * this.turn.z - this.turn.w * this.turn.y), 1 - 2 * (this.turn.x * this.turn.x + this.turn.y * this.turn.y));
      return wing.set(-0.1, -0.24, -0.2).applyAxisAngle(UP, yaw).add(this.eye);
    };
    this.cleanupFuncs.push(
      onV2('wordSpoken', ({ word }) => {
        const done = this.wordDone;
        this.wordDone = null;
        done?.(word);
      }),
    );
  }

  update(delta: number): void {
    this.time += delta;
    this.player.head.getWorldPosition(this.eye);
    for (const fn of this.frames) fn(delta);
    this.people.update(delta);
    this.captions.update(delta, this.player.head);
    this.rain.update(delta, this.eye);
    this.loaves.update(delta);
    this.gold.update(delta);
    this.bear.update(delta);
    this.rig.update(delta);
    this.sounds.bed('rain_loop', this.rain.on ? 0.5 : 0);
    this.sounds.update(delta);
    if (import.meta.env.DEV && Math.floor(this.time / 5) !== Math.floor((this.time - delta) / 5)) {
      const info = this.world.renderer.info.render;
      console.info(`[render] ${info.calls} draws, ${Math.round(info.triangles / 1000)}k triangles (last frame)`);
      // Which roots hold the visible meshes (before frustum culling), the biggest first.
      const by = new Map<string, { draws: number; tris: number }>();
      this.world.scene.traverseVisible((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh !== true) return;
        let top: Object3D = o;
        while (top.parent != null && top.parent !== this.world.scene) top = top.parent;
        const g = mesh.geometry;
        const groups = Math.max(1, Array.isArray(mesh.material) ? mesh.material.length : 1);
        const count = (mesh as unknown as { count?: number; isInstancedMesh?: boolean }).isInstancedMesh === true ? ((mesh as unknown as { count: number }).count ?? 1) : 1;
        const tris = ((g.index?.count ?? g.getAttribute('position')?.count ?? 0) / 3) * count;
        const key = top.name || top.type;
        const e = by.get(key) ?? { draws: 0, tris: 0 };
        e.draws += groups;
        e.tris += tris;
        by.set(key, e);
      });
      const list = [...by.entries()].sort((x, y) => y[1].draws - x[1].draws).slice(0, 12);
      console.info(`[render] by root: ${list.map(([k, v]) => `${k} ${v.draws}/${Math.round(v.tris / 1000)}k`).join(', ')}`);
    }
    if (this.anyPress()) this.ghost.touched();
    this.ghost.update(delta, this.player.head);
    if (this.timers.length > 0) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length > 0) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.done();
      }
    }
    if (this.conditions.length > 0) {
      const met = this.conditions.filter((c) => c.test());
      if (met.length > 0) {
        this.conditions = this.conditions.filter((c) => !met.includes(c));
        for (const c of met) c.done();
      }
    }
    if (this.perchDone != null) this.watchPerches();
  }

  /** Seconds of play since the game began. */
  get now(): number {
    return this.time;
  }

  wait(seconds: number): Promise<void> {
    return new Promise((done) => this.timers.push({ at: this.time + seconds, done }));
  }

  until(test: () => boolean): Promise<void> {
    if (test()) return Promise.resolve();
    return new Promise((done) => {
      const entry = { test, done };
      this.conditions.push(entry);
      this.onSkip(() => {
        this.conditions = this.conditions.filter((c) => c !== entry);
        done();
      });
    });
  }

  /** Dev only: what to do if the current wait is skipped (cleared once any wait ends). */
  onSkip(fn: () => void): void {
    if (import.meta.env.DEV) this.skips.push(fn);
  }

  /** Dev only (dev-tools.ts, key 7): finish whatever the scene is waiting for. */
  skip(): void {
    const skips = this.skips;
    this.skips = [];
    this.captions.hide();
    for (const fn of skips) fn();
    if (import.meta.env.DEV) console.info(`[director] skipped (${skips.length})`);
  }

  /** The eye (world). */
  get eyeAt(): Vector3 {
    return this.eye;
  }

  /** Whether the player looks within `degrees` of `point`. */
  looksAt(point: Vector3, degrees: number): boolean {
    this.player.head.getWorldQuaternion(this.turn);
    const forward = this.at.set(0, 0, -1).applyQuaternion(this.turn);
    const to = point.clone().sub(this.eye).normalize();
    return forward.dot(to) >= Math.cos((degrees * Math.PI) / 180);
  }

  /** A point to show a ring at and to land on (an empty marker). */
  marker(position: Vector3, name: string): Group {
    const group = new Group();
    group.name = name;
    group.position.copy(position);
    this.world.createTransformEntity(group, { persistent: true });
    return group;
  }

  /** Run `fn` every frame (before people and effects are drawn) until the returned function is called. */
  each(fn: (delta: number) => void): () => void {
    this.frames.add(fn);
    return () => this.frames.delete(fn);
  }

  /** Stop waiting for a perch (another choice was made first); its promise never resolves. */
  cancelPerch(): void {
    this.perchDone = null;
    this.perches = [];
    setV2Targets([]);
  }

  /** Stop waiting for a word; its promise never resolves (but a dev skip may). */
  cancelWord(): void {
    this.wordDone = null;
  }

  /** H2: the perches are ringed; resolves with the one a pinch (or trigger) takes, by ray or near; skipped, with `skipTo`. */
  choosePerch(perches: Object3D[], skipTo = 0): Promise<number> {
    this.perches = perches;
    setV2Targets(perches);
    return new Promise((done) => {
      this.perchDone = (index) => {
        this.perchDone = null;
        this.perches = [];
        setV2Targets([]);
        done(index);
      };
      this.onSkip(() => this.perchDone?.(skipTo));
    });
  }

  /** H1: resolves with the next word a feather says into the listening ear (set by the scene); skipped, with `expected`. */
  nextWord(expected = ''): Promise<string> {
    return new Promise((done) => {
      this.wordDone = done;
      this.onSkip(() => {
        this.wordDone = null;
        done(expected);
      });
    });
  }

  /** Whether a hand pinched or a controller pressed this frame. */
  private anyPress(): boolean {
    const xr = this.input.xr;
    for (const side of SIDES) {
      if (pinchPoint(side) != null && xr.getSelectState(side).start) return true;
      const pad = xr.gamepads[side];
      if ((pad?.getButtonDown(InputComponent.Trigger) ?? false) || (pad?.getButtonDown(InputComponent.Squeeze) ?? false)) return true;
    }
    return false;
  }

  private watchPerches(): void {
    const xr = this.input.xr;
    for (const side of SIDES) {
      const hand = pinchPoint(side);
      let start = false;
      if (hand != null) start = xr.getSelectState(side).start;
      else if (xr.isPrimary('controller', side)) {
        const pad = xr.gamepads[side];
        start = (pad?.getButtonDown(InputComponent.Trigger) ?? false) || (pad?.getButtonDown(InputComponent.Squeeze) ?? false);
      }
      if (!start) continue;
      // A pinch that takes something in reach (a feather on the wing) is not a perch picked far off along its ray.
      if (pinchTarget(side).via === 'grab' || pinchTarget(side).via === 'drag') continue;
      const near = hand ?? this.player.gripSpaces[side].getWorldPosition(this.at);
      const space = this.player.raySpaces[side];
      space.getWorldPosition(this.ray.origin);
      space.getWorldQuaternion(this.turn);
      this.ray.direction.set(0, 0, -1).applyQuaternion(this.turn);
      let best = -1;
      let bestAt = Infinity;
      this.perches.forEach((perch, i) => {
        perch.getWorldPosition(this.sphere.center);
        const d = this.sphere.center.distanceTo(near);
        if (d <= PERCH_NEAR && d < bestAt) {
          best = i;
          bestAt = d;
          return;
        }
        this.sphere.radius = PERCH_RAY * Math.max(1, this.sphere.center.distanceTo(this.ray.origin) / 3);
        if (this.ray.intersectsSphere(this.sphere)) {
          const along = this.sphere.center.distanceTo(this.ray.origin) + 10;
          if (along < bestAt) {
            best = i;
            bestAt = along;
          }
        }
      });
      if (best >= 0) {
        if (import.meta.env.DEV) console.info(`[director] perch ${this.perches[best].name} taken by ${side}`);
        this.perchDone?.(best);
        return;
      }
    }
  }
}
