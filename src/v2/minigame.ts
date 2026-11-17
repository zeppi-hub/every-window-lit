import { emitV2, type V2EventName, type V2Events } from './events.js';

/**
 * A memory's mini game (META_VR_V2_TASARIM.md, "Zorluk: her anı üç
 * aşamalı"): stages played in order, each harder than the last. Losing
 * replays only that stage, never the whole game; from the HINT_AFTER-th
 * loss of a stage on, every further loss also asks for a hint (the parrot's
 * hook). A stage may have a time limit; its clock stops while the game is
 * paused (the hand lost from tracking, the headset taken off). Winning the
 * last stage wins the word.
 *
 * Pure: the game's own scene logic calls win() and lose(); MiniGameSystem
 * calls update() every frame with whether play is paused.
 */
export interface StageSpec {
  /** A short name for logs and tests ("one acrobat", "two acrobats"). */
  name: string;
  /** Seconds to win it in; lost on time when it runs out. None: no limit. */
  seconds?: number;
}

export type Phase = 'ready' | 'playing' | 'between' | 'won' | 'stopped';

export const HINT_AFTER = 2;
/** The pause after a stage is won or lost, before the next (or the same) starts (s). */
export const BETWEEN_SECONDS = 1.5;

type Emit = <K extends V2EventName>(name: K, payload: V2Events[K]) => void;

export class MiniGame {
  readonly word: string;
  readonly stages: readonly StageSpec[];
  private emit: Emit;
  private phaseNow: Phase = 'ready';
  private stageNow = 0;
  private elapsedNow = 0;
  private betweenLeft = 0;
  /** After the pause: the stage to start (the next, or the same again). */
  private nextStage = 0;
  private readonly attempts: number[];
  private readonly failures: number[];

  constructor(word: string, stages: readonly StageSpec[], emit: Emit = emitV2) {
    if (stages.length === 0) throw new Error('a mini game needs at least one stage');
    this.word = word;
    this.stages = stages;
    this.emit = emit;
    this.attempts = stages.map(() => 0);
    this.failures = stages.map(() => 0);
  }

  get phase(): Phase {
    return this.phaseNow;
  }
  /** The stage being played (or about to be), from 0. */
  get stage(): number {
    return this.stageNow;
  }
  /** Seconds played in this attempt of the stage, paused time not counted. */
  get elapsed(): number {
    return this.elapsedNow;
  }
  /** Seconds left of the stage's limit, or Infinity with none. */
  get remaining(): number {
    const limit = this.stages[this.stageNow].seconds;
    return limit == null ? Infinity : Math.max(0, limit - this.elapsedNow);
  }
  attemptsOf(stage: number): number {
    return this.attempts[stage] ?? 0;
  }
  failuresOf(stage: number): number {
    return this.failures[stage] ?? 0;
  }

  /** Starts the first stage (again, from a stop). */
  start(): void {
    this.begin(0);
  }

  /** Ends play without a result (the player left the memory). */
  stop(): void {
    this.phaseNow = 'stopped';
  }

  /** The scene's logic: the current stage is won. */
  win(): void {
    if (this.phaseNow !== 'playing') return;
    const stage = this.stageNow;
    this.emit('stageWon', { word: this.word, stage });
    if (stage === this.stages.length - 1) {
      this.phaseNow = 'won';
      this.emit('wordWon', { word: this.word });
      return;
    }
    this.pauseThen(stage + 1);
  }

  /** The scene's logic: the current stage is lost (`reason` for logs: "two misses", "time"). */
  lose(reason: string): void {
    if (this.phaseNow !== 'playing') return;
    const stage = this.stageNow;
    this.failures[stage] += 1;
    const failures = this.failures[stage];
    this.emit('stageLost', { word: this.word, stage, reason, failures });
    if (failures >= HINT_AFTER) this.emit('hint', { word: this.word, stage, failures });
    this.pauseThen(stage);
  }

  /** Every frame: the clock runs while playing and not `paused`; a stage out of time is lost; the pause between stages ends. */
  update(dt: number, paused: boolean): void {
    if (paused || dt <= 0) return;
    if (this.phaseNow === 'between') {
      this.betweenLeft -= dt;
      if (this.betweenLeft <= 0) this.begin(this.nextStage);
      return;
    }
    if (this.phaseNow !== 'playing') return;
    this.elapsedNow += dt;
    const limit = this.stages[this.stageNow].seconds;
    if (limit != null && this.elapsedNow >= limit) this.lose('time');
  }

  private pauseThen(stage: number): void {
    this.phaseNow = 'between';
    this.betweenLeft = BETWEEN_SECONDS;
    this.nextStage = stage;
  }

  private begin(stage: number): void {
    this.stageNow = stage;
    this.elapsedNow = 0;
    this.attempts[stage] += 1;
    this.phaseNow = 'playing';
    this.emit('stageStart', { word: this.word, stage, attempt: this.attempts[stage] });
  }
}

/** The games being played now; MiniGameSystem steps them. */
const running = new Set<MiniGame>();

export function playMiniGame(game: MiniGame): MiniGame {
  running.add(game);
  game.start();
  return game;
}

export function endMiniGame(game: MiniGame): void {
  game.stop();
  running.delete(game);
}

export function runningGames(): ReadonlySet<MiniGame> {
  return running;
}
