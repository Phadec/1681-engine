import { Animator, type AnimationClip } from './Animator';
import {
  OP_EQ,
  OP_GE,
  OP_GT,
  OP_LE,
  OP_LT,
  OP_NE,
  PARAM_BOOL,
  PARAM_TRIGGER,
  compileParams,
  compileStates,
  compileTransitions,
  type CompiledParams,
  type CompiledStates,
  type CompiledTransitions,
} from './animStateCompile';
import type { AnimParams, AnimStateMachineOptions } from './animStateTypes';

/**
 * Chooses which clip an `Animator` plays from named states and the transitions between them, the way an animation
 * graph in a larger engine does: the game sets parameters (a bool, a number, a one-shot trigger) and the machine
 * moves between states when a transition's conditions hold, when a clip has played through, or from any state at
 * all by priority. Frame markers fire events (a footstep on frame 3) for the game to hang sounds and effects on.
 *
 * Pure and driven by `update(dt)`, so it runs under node with a fake clock. The definition is compiled into typed
 * arrays once; an update allocates nothing.
 *
 * ```ts
 * const sm = new AnimStateMachine(sheet.clips, {
 *   initial: 'idle',
 *   params: { speed: 0, grounded: true, jump: 'trigger' },
 *   states: { idle: { clip: 'idle' }, run: { clip: 'run', markers: [{ frame: 2, name: 'step' }] }, jump: { clip: 'jump' } },
 *   transitions: [
 *     { from: 'idle', to: 'run', when: { speed: ['>', 0] } },
 *     { from: 'run', to: 'idle', when: { speed: 0 } },
 *     { from: '*', to: 'jump', when: { jump: true, grounded: true }, priority: 10 },
 *   ],
 * });
 * sm.onEvent = (name) => name === 'step' && sound.play('step');
 * sm.set('speed', 3);
 * sm.update(dt);              // seconds; then show sm.frame
 * ```
 */
export class AnimStateMachine<State extends string = string, Clip extends string = string, P extends AnimParams = AnimParams> {
  /** The animator it drives; read `frame` off it (or off the machine). */
  readonly animator: Animator<Clip>;
  /** Fired for every marker playback reaches, the state's first frame's on entering it. */
  onEvent: ((event: string, state: State, frame: number) => void) | null = null;
  /** Fired after each change of state. */
  onStateChange: ((from: State, to: State) => void) | null = null;

  private readonly params: CompiledParams;
  private readonly states: CompiledStates;
  private readonly tr: CompiledTransitions;
  private readonly keepTriggers: boolean;
  private stateIndex: number;
  /** Time played in this state, ms, scaled by speed as the animator scales it. */
  private time = 0;

  constructor(clips: Record<Clip, AnimationClip>, options: AnimStateMachineOptions<State, Clip, P>) {
    const opts = options as unknown as AnimStateMachineOptions<string, string, AnimParams>;
    this.params = compileParams(options.params ?? {});
    this.states = compileStates(opts, clips, this.params);
    this.tr = compileTransitions(opts, this.states, this.params);
    this.keepTriggers = options.keepTriggers === true;
    this.stateIndex = this.states.index.get(options.initial)!;
    this.animator = new Animator(clips, this.states.clips[this.stateIndex] as Clip);
    this.applySpeed();
  }

  /** The state playing. */
  get state(): State {
    return this.states.names[this.stateIndex] as State;
  }

  /** The frame to show now (a sheet frame index or name, as the clip lists it). */
  get frame(): string | number {
    return this.animator.frame;
  }

  /** How much of this state's clip has played: 0 at entry, 1 after one pass, 2 after two loops. */
  get normalizedTime(): number {
    return this.time / this.states.lengths[this.stateIndex]!;
  }

  /** Sets a bool or number parameter. */
  set(name: keyof P & string, value: boolean | number): this {
    const i = this.paramIndex(name);
    if (this.params.kinds[i] === PARAM_TRIGGER) throw new Error(`AnimStateMachine: "${name}" is a trigger; use trigger()`);
    this.params.values[i] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    return this;
  }

  /** A parameter's value: bools as booleans, triggers as whether they are set. */
  get(name: keyof P & string): boolean | number {
    const i = this.paramIndex(name);
    const v = this.params.values[i]!;
    return this.params.kinds[i] === PARAM_BOOL || this.params.kinds[i] === PARAM_TRIGGER ? v !== 0 : v;
  }

  /** Fires a trigger: the next update's transitions see it once. */
  trigger(name: keyof P & string): this {
    this.params.values[this.triggerIndex(name)] = 1;
    return this;
  }

  resetTrigger(name: keyof P & string): this {
    this.params.values[this.triggerIndex(name)] = 0;
    return this;
  }

  /** Goes to `state` now, whatever the transitions say (a respawn, a cut scene). */
  play(state: State): this {
    const i = this.states.index.get(state);
    if (i === undefined) throw new Error(`AnimStateMachine: no state "${state}"`);
    this.enter(i);
    return this;
  }

  /** Back to the initial values of every parameter (triggers cleared). */
  resetParams(): this {
    this.params.values.set(this.params.initial);
    return this;
  }

  /**
   * Advances the clip by `dt` seconds, fires the markers it passed, then takes at most one transition (so a chain of
   * them never runs through several states in one frame). `update(0)` only checks the transitions.
   */
  update(dt: number): void {
    const s = this.stateIndex;
    this.applySpeed();
    const a = this.animator;
    const before = a.frameIndex;
    const wasFinished = a.finished;
    a.update(dt);
    if (dt > 0 && a.speed > 0) {
      const delta = dt * 1000 * a.speed;
      this.time += delta;
      if (!wasFinished) this.firePassed(s, before, a.frameIndex, delta);
    }
    // a marker's listener may have changed state: the transitions are the state's now playing
    const t = this.pick(this.stateIndex);
    if (t >= 0) {
      this.consumeTriggers(t);
      this.enter(this.tr.to[t]!);
    }
    if (!this.keepTriggers) this.clearTriggers();
  }

  private pick(s: number): number {
    const cands = this.states.candidates[s]!;
    const tr = this.tr;
    const ended = this.animator.finished || this.time >= this.states.lengths[s]!;
    for (let k = 0; k < cands.length; k++) {
      const t = cands[k]!;
      if (tr.to[t] === s && tr.anyState[t] && !tr.self[t]) continue;
      if (tr.onEnd[t] && !ended) continue;
      if (tr.exitTime[t]! >= 0 && this.normalizedTime < tr.exitTime[t]!) continue;
      if (this.holds(t)) return t;
    }
    return -1;
  }

  private holds(t: number): boolean {
    const tr = this.tr;
    const values = this.params.values;
    for (let c = tr.condStart[t]!; c < tr.condEnd[t]!; c++) {
      const v = values[tr.condParam[c]!]!;
      const want = tr.condValue[c]!;
      let ok: boolean;
      switch (tr.condOp[c]) {
        case OP_EQ: ok = v === want; break;
        case OP_NE: ok = v !== want; break;
        case OP_GT: ok = v > want; break;
        case OP_GE: ok = v >= want; break;
        case OP_LT: ok = v < want; break;
        case OP_LE: ok = v <= want; break;
        default: ok = false;
      }
      if (!ok) return false;
    }
    return true;
  }

  private enter(i: number): void {
    const from = this.stateIndex;
    this.stateIndex = i;
    this.time = 0;
    this.animator.play(this.states.clips[i] as Clip, true);
    this.applySpeed();
    this.onStateChange?.(this.states.names[from] as State, this.states.names[i] as State);
    // a marker on the first frame (a jump's whoosh) belongs to entering the state
    this.fire(i, 0);
  }

  /**
   * Fires the markers of every frame after `from` up to `to`. The animator skips frames on a long step, so they are
   * walked rather than only the one landed on; a step long enough to loop the whole clip fires each frame once.
   */
  private firePassed(s: number, from: number, to: number, deltaMs: number): void {
    const n = this.states.frameCounts[s]!;
    let steps = (to - from + n) % n;
    if (steps === 0 && deltaMs >= this.states.lengths[s]!) steps = n;
    for (let k = 1; k <= steps; k++) {
      this.fire(s, (from + k) % n);
      if (this.stateIndex !== s) return; // a listener changed state: the rest belong to a clip no longer playing
    }
  }

  private fire(s: number, frame: number): void {
    const names = this.states.markers[s]![frame];
    if (!names || !this.onEvent) return;
    const state = this.states.names[s] as State;
    for (let i = 0; i < names.length; i++) this.onEvent(names[i]!, state, frame);
  }

  private applySpeed(): void {
    const s = this.stateIndex;
    const p = this.states.speedParams[s]!;
    this.animator.speed = this.states.speeds[s]! * (p >= 0 ? Math.abs(this.params.values[p]!) : 1);
  }

  private consumeTriggers(t: number): void {
    const tr = this.tr;
    for (let c = tr.condStart[t]!; c < tr.condEnd[t]!; c++) {
      if (this.params.kinds[tr.condParam[c]!] === PARAM_TRIGGER) this.params.values[tr.condParam[c]!] = 0;
    }
  }

  private clearTriggers(): void {
    const { kinds, values } = this.params;
    for (let i = 0; i < kinds.length; i++) if (kinds[i] === PARAM_TRIGGER) values[i] = 0;
  }

  private paramIndex(name: string): number {
    const i = this.params.index.get(name);
    if (i === undefined) throw new Error(`AnimStateMachine: no parameter "${name}"`);
    return i;
  }

  private triggerIndex(name: string): number {
    const i = this.paramIndex(name);
    if (this.params.kinds[i] !== PARAM_TRIGGER) throw new Error(`AnimStateMachine: "${name}" is not a trigger`);
    return i;
  }
}
