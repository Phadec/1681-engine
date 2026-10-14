import type { AnimationClip } from './Animator';
import type { AnimCondition, AnimParams, AnimStateMachineOptions, CompareOp } from './animStateTypes';

/*
 * The state machine's definition turned once, at construction, into flat typed arrays, so an update walks numbers and
 * allocates nothing: parameter values by index, every transition's conditions in one run of arrays, and each state's
 * candidate transitions (its own and the any-state ones) already sorted by priority.
 */

export const PARAM_BOOL = 0;
export const PARAM_NUMBER = 1;
export const PARAM_TRIGGER = 2;

export const OP_EQ = 0;
export const OP_NE = 1;
export const OP_GT = 2;
export const OP_GE = 3;
export const OP_LT = 4;
export const OP_LE = 5;

const OPS: Record<CompareOp, number> = { '==': OP_EQ, '!=': OP_NE, '>': OP_GT, '>=': OP_GE, '<': OP_LT, '<=': OP_LE };

export interface CompiledParams {
  names: string[];
  index: Map<string, number>;
  kinds: Uint8Array;
  values: Float64Array;
  initial: Float64Array;
}

export interface CompiledStates {
  names: string[];
  index: Map<string, number>;
  clips: string[];
  speeds: Float64Array;
  /** Index of the speed parameter, or -1. */
  speedParams: Int32Array;
  /** Total length of each state's clip in ms, at speed 1. */
  lengths: Float64Array;
  frameCounts: Int32Array;
  /** Per state, per clip frame: the event names fired there (undefined: none). */
  markers: (readonly (readonly string[] | undefined)[])[];
  /** Per state: transition indices to try, best first. */
  candidates: Int32Array[];
}

export interface CompiledTransitions {
  to: Int32Array;
  anyState: Uint8Array;
  self: Uint8Array;
  onEnd: Uint8Array;
  /** -1: none. */
  exitTime: Float64Array;
  condStart: Int32Array;
  condEnd: Int32Array;
  condParam: Int32Array;
  condOp: Uint8Array;
  condValue: Float64Array;
}

/** The length of a clip in ms, frame by frame exactly as `Animator` times it. */
export function clipLength(clip: AnimationClip): number {
  let ms = 0;
  for (let i = 0; i < clip.frames.length; i++) ms += Math.max(1, clip.durations?.[i] ?? 1000 / (clip.fps ?? 10));
  return ms;
}

export function compileParams(decl: AnimParams): CompiledParams {
  const names = Object.keys(decl);
  const kinds = new Uint8Array(names.length);
  const initial = new Float64Array(names.length);
  names.forEach((n, i) => {
    const v = decl[n];
    if (v === 'trigger') kinds[i] = PARAM_TRIGGER;
    else if (typeof v === 'boolean') {
      kinds[i] = PARAM_BOOL;
      initial[i] = v ? 1 : 0;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      kinds[i] = PARAM_NUMBER;
      initial[i] = v;
    } else throw new Error(`AnimStateMachine: parameter "${n}" must start as a boolean, a number or 'trigger'`);
  });
  return { names, index: new Map(names.map((n, i) => [n, i])), kinds, values: initial.slice(), initial };
}

export function compileStates(
  options: AnimStateMachineOptions<string, string, AnimParams>,
  clips: Record<string, AnimationClip>,
  params: CompiledParams,
): CompiledStates {
  const names = Object.keys(options.states);
  if (!names.includes(options.initial)) throw new Error(`AnimStateMachine: no state "${options.initial}"`);
  const n = names.length;
  const out: CompiledStates = {
    names,
    index: new Map(names.map((s, i) => [s, i])),
    clips: [],
    speeds: new Float64Array(n),
    speedParams: new Int32Array(n),
    lengths: new Float64Array(n),
    frameCounts: new Int32Array(n),
    markers: [],
    candidates: [],
  };
  names.forEach((s, i) => {
    const def = options.states[s]!;
    const clip = clips[def.clip];
    if (!clip) throw new Error(`AnimStateMachine: state "${s}" plays clip "${def.clip}", which does not exist`);
    if (clip.frames.length === 0) throw new Error(`AnimStateMachine: clip "${def.clip}" has no frames`);
    out.clips.push(def.clip);
    out.speeds[i] = def.speed ?? 1;
    out.speedParams[i] = def.speedParam === undefined ? -1 : paramIndex(params, def.speedParam, PARAM_NUMBER, `state "${s}"`);
    out.lengths[i] = clipLength(clip);
    out.frameCounts[i] = clip.frames.length;
    const byFrame: (string[] | undefined)[] = new Array(clip.frames.length).fill(undefined);
    for (const m of def.markers ?? []) {
      if (!(m.frame >= 0 && m.frame < clip.frames.length)) throw new Error(`AnimStateMachine: marker "${m.name}" of state "${s}" is past its clip`);
      (byFrame[m.frame] ??= []).push(m.name);
    }
    out.markers.push(byFrame);
  });
  return out;
}

export function compileTransitions(
  options: AnimStateMachineOptions<string, string, AnimParams>,
  states: CompiledStates,
  params: CompiledParams,
): CompiledTransitions {
  const list = options.transitions ?? [];
  const n = list.length;
  const condParam: number[] = [];
  const condOp: number[] = [];
  const condValue: number[] = [];
  const t: CompiledTransitions = {
    to: new Int32Array(n),
    anyState: new Uint8Array(n),
    self: new Uint8Array(n),
    onEnd: new Uint8Array(n),
    exitTime: new Float64Array(n),
    condStart: new Int32Array(n),
    condEnd: new Int32Array(n),
    condParam: new Int32Array(0),
    condOp: new Uint8Array(0),
    condValue: new Float64Array(0),
  };
  const sources: number[][] = states.names.map(() => []);
  const stateOf = (s: string, where: string) => {
    const i = states.index.get(s);
    if (i === undefined) throw new Error(`AnimStateMachine: ${where} names no state "${s}"`);
    return i;
  };
  list.forEach((tr, i) => {
    const where = `transition ${i} (→ ${tr.to})`;
    t.to[i] = stateOf(tr.to, where);
    t.anyState[i] = tr.from === '*' ? 1 : 0;
    t.self[i] = tr.self ? 1 : 0;
    t.onEnd[i] = tr.onEnd ? 1 : 0;
    t.exitTime[i] = tr.exitTime ?? -1;
    if (tr.from === '*') states.names.forEach((_s, si) => sources[si]!.push(i));
    else for (const s of typeof tr.from === 'string' ? [tr.from] : tr.from) sources[stateOf(s, where)]!.push(i);
    t.condStart[i] = condParam.length;
    for (const [name, cond] of Object.entries(tr.when ?? {}) as [string, AnimCondition][]) {
      const p = params.index.get(name);
      if (p === undefined) throw new Error(`AnimStateMachine: ${where} asks for parameter "${name}", which is not declared`);
      const [op, value] = conditionOf(params.kinds[p]!, cond, `${where}, parameter "${name}"`);
      condParam.push(p);
      condOp.push(op);
      condValue.push(value);
    }
    t.condEnd[i] = condParam.length;
  });
  t.condParam = Int32Array.from(condParam);
  t.condOp = Uint8Array.from(condOp);
  t.condValue = Float64Array.from(condValue);
  const priority = (i: number) => list[i]!.priority ?? 0;
  // a stable sort: equal priorities keep the order they were written in
  states.candidates = sources.map((ids) => Int32Array.from(ids.sort((a, b) => priority(b) - priority(a) || a - b)));
  return t;
}

function conditionOf(kind: number, cond: AnimCondition, where: string): [number, number] {
  if (Array.isArray(cond)) {
    const [op, value] = cond as readonly [CompareOp, number];
    if (kind !== PARAM_NUMBER) throw new Error(`AnimStateMachine: ${where} compares a parameter that is not a number`);
    if (!(op in OPS) || !Number.isFinite(value)) throw new Error(`AnimStateMachine: ${where} has a bad comparison`);
    return [OPS[op], value];
  }
  if (kind === PARAM_NUMBER) {
    if (typeof cond !== 'number') throw new Error(`AnimStateMachine: ${where} is a number; give a number or [op, number]`);
    return [OP_EQ, cond];
  }
  if (typeof cond !== 'boolean') throw new Error(`AnimStateMachine: ${where} is a ${kind === PARAM_BOOL ? 'bool' : 'trigger'}; give true or false`);
  return [OP_EQ, cond ? 1 : 0];
}

function paramIndex(params: CompiledParams, name: string, kind: number, where: string): number {
  const i = params.index.get(name);
  if (i === undefined || params.kinds[i] !== kind) throw new Error(`AnimStateMachine: ${where} names "${name}", which is not a number parameter`);
  return i;
}
