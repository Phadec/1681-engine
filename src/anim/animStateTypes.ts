import type { ClipMarker } from './asepriteTypes';

/** A parameter's declaration, by its starting value: a bool, a number, or the word 'trigger' (a one-shot flag). */
export type AnimParamDecl = boolean | number | 'trigger';
export type AnimParams = Record<string, AnimParamDecl>;

export type CompareOp = '==' | '!=' | '>' | '>=' | '<' | '<=';

/**
 * What a transition asks of one parameter: a bool or number to equal, `[op, number]` to compare a number, and for a
 * trigger `true` (it was fired) or `false` (it was not).
 */
export type AnimCondition = boolean | number | readonly [CompareOp, number];

export interface AnimStateDef<Clip extends string> {
  /** The clip this state plays, entered from its first frame. */
  clip: Clip;
  /** Playback speed (default 1). */
  speed?: number;
  /** A number parameter the speed is multiplied by (its size: a run cadence that follows the body's speed). */
  speedParam?: string;
  /** Events fired as playback reaches frames of the clip (positions in the clip, 0-based). */
  markers?: readonly ClipMarker[];
}

export interface AnimTransition<State extends string, P extends AnimParams> {
  /** The state it leaves, several, or '*' for any state (an any-state transition). */
  from: State | '*' | readonly State[];
  to: State;
  /** Every condition must hold. Triggers it names are used up when it is taken. */
  when?: { readonly [K in keyof P]?: AnimCondition };
  /** Only once the clip has played through once (a non-looping clip has finished, a looping one has looped). */
  onEnd?: boolean;
  /** Only once this share of the clip has played (0.5 is half way; 2 is two loops). */
  exitTime?: number;
  /** Checked before lower ones; ties in the order written. Default 0. */
  priority?: number;
  /** An any-state transition may re-enter the state it is already in (default false: it would restart every update). */
  self?: boolean;
}

export interface AnimStateMachineOptions<State extends string, Clip extends string, P extends AnimParams> {
  initial: NoInfer<State>;
  states: Record<State, AnimStateDef<Clip>>;
  params?: P;
  transitions?: readonly AnimTransition<NoInfer<State>, NoInfer<P>>[];
  /**
   * Keep a trigger no transition used until one does (default false: cleared at the end of every update). Off by
   * default because a press that changed nothing now — a jump pressed in mid-air — should not play out later, on
   * landing.
   */
  keepTriggers?: boolean;
}
