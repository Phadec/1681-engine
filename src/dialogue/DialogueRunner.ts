import { expr, type ExprScope, type ExprValue } from './expr';
import type { DialogueChoice, DialogueCommand, DialogueLine, DialogueNode, DialogueScript, DialogueStep, ShownChoice } from './script';

export interface DialogueOptions {
  /** The variables conditions read and `set` writes; shared with the game (default a fresh object). */
  vars?: Record<string, unknown>;
  /** Functions an expression may call, beside the built-in `visited(node)` and `chose(node, index)`. */
  functions?: Record<string, (...args: ExprValue[]) => ExprValue>;
  /** A `do` command: what the game does for it. */
  onCommand?: (name: string, args: readonly unknown[], runner: DialogueRunner) => void;
  /** A line's or a choice's text in the player's language, before `{…}` is filled in (default as written). */
  translate?: (text: string, key: string | undefined) => string;
}

/** Where a dialogue was, and what it knew, for a save: plain data. */
export interface DialogueSave {
  node: string | null;
  line: number;
  vars: Record<string, unknown>;
  visits: Record<string, number>;
  chosen: string[];
}

/** Nodes entered in a row without anything shown before the runner decides the script loops for good. */
const MAX_HOPS = 1000;

/**
 * Runs a `DialogueScript`: hands the game one step at a time — a line, a set of choices, the end — and moves on when
 * the game says the line was read (`next`) or a choice made (`choose`). It draws nothing: the game's own box shows a
 * `ShownLine` however it likes (a typewriter, a portrait from `tags`).
 *
 * ```ts
 * const talk = new DialogueRunner(script, { vars: save.flags, onCommand: (name, args) => game.run(name, args) });
 * let step = talk.start();
 * // on a press: step = step.type === 'line' ? talk.next() : talk.choose(picked);
 * ```
 */
export class DialogueRunner {
  readonly vars: Record<string, unknown>;
  private node: string | null = null;
  private line = 0;
  private step: DialogueStep = { type: 'end' };
  private readonly visits = new Map<string, number>();
  private readonly chosen = new Set<string>();
  private readonly scope: ExprScope;

  constructor(
    readonly script: DialogueScript,
    private readonly options: DialogueOptions = {},
  ) {
    this.vars = options.vars ?? {};
    const fns = options.functions ?? {};
    this.scope = {
      get: (name) => readPath(this.vars, name),
      call: (name, args) => {
        if (name === 'visited') return this.visits.get(String(args[0])) ?? 0;
        if (name === 'chose') return this.chosen.has(`${args[0]}#${args[1]}`);
        const f = fns[name];
        if (!f) throw new Error(`dialogue: no function '${name}'`);
        return f(...args);
      },
    };
  }

  /** The step showing now. */
  get current(): DialogueStep {
    return this.step;
  }

  /** The node the dialogue is in, or null once it has ended. */
  get at(): string | null {
    return this.node;
  }

  /** How many times a node was entered. */
  visited(node: string): number {
    return this.visits.get(node) ?? 0;
  }

  /** Begins at `node` (default the script's `start`, else its first node). */
  start(node = this.script.start ?? Object.keys(this.script.nodes)[0]): DialogueStep {
    if (node === undefined) return this.finish();
    return this.go(node);
  }

  /** The line showing was read: on to the next line, the choices, or wherever the node leads. */
  next(): DialogueStep {
    if (this.step.type !== 'line') return this.step;
    this.line++;
    return this.show(0);
  }

  /** Picks a choice by its `index` (as shown). A locked or unknown index changes nothing. */
  choose(index: number): DialogueStep {
    if (this.step.type !== 'choices' || this.node === null) return this.step;
    const shown = this.step.choices.find((c) => c.index === index);
    if (!shown?.enabled) return this.step;
    const node = this.node;
    const choice = this.nodeOf(node).choices![index]!;
    this.chosen.add(`${node}#${index}`);
    this.assign(choice.set);
    this.run(choice.do);
    return choice.goto === undefined ? this.finish() : this.go(choice.goto);
  }

  /** Jumps to a node from outside (the game's own event broke in). */
  jump(node: string): DialogueStep {
    return this.go(node);
  }

  /** Ends the dialogue now. */
  stop(): DialogueStep {
    return this.finish();
  }

  /** The value of an expression over this dialogue's variables, for a game that shares the language. */
  evaluate(source: string): ExprValue {
    return expr(source)(this.scope);
  }

  save(): DialogueSave {
    return {
      node: this.node,
      line: this.line,
      vars: structuredClone(this.vars),
      visits: Object.fromEntries(this.visits),
      chosen: [...this.chosen],
    };
  }

  /** Puts a saved dialogue back where it was, without running the node's `set` and `do` again. */
  restore(save: DialogueSave): DialogueStep {
    for (const k of Object.keys(this.vars)) delete this.vars[k];
    Object.assign(this.vars, structuredClone(save.vars));
    this.visits.clear();
    for (const [k, v] of Object.entries(save.visits)) this.visits.set(k, v);
    this.chosen.clear();
    for (const c of save.chosen) this.chosen.add(c);
    if (save.node === null || !this.script.nodes[save.node]) return this.finish();
    this.node = save.node;
    this.line = save.line;
    return this.show(0);
  }

  private go(node: string): DialogueStep {
    return this.enter(node, 0);
  }

  private enter(node: string, hops: number): DialogueStep {
    if (hops > MAX_HOPS) throw new Error(`dialogue: '${node}' loops without showing anything`);
    const n = this.nodeOf(node);
    this.node = node;
    this.line = 0;
    this.visits.set(node, (this.visits.get(node) ?? 0) + 1);
    this.assign(n.set);
    this.run(n.do);
    // a command may have jumped or stopped the dialogue
    if (this.node !== node) return this.step;
    return this.show(hops);
  }

  /** The step from the current line on: the next line that holds, else the choices, else the way on. */
  private show(hops: number): DialogueStep {
    const node = this.node!;
    const n = this.nodeOf(node);
    const lines = n.lines ?? [];
    for (; this.line < lines.length; this.line++) {
      const raw = lines[this.line]!;
      const line: DialogueLine = typeof raw === 'string' ? { text: raw } : raw;
      if (line.if !== undefined && !this.test(line.if)) continue;
      return (this.step = { type: 'line', node, speaker: line.speaker, text: this.text(line.text, line.key), tags: line.tags ?? [] });
    }
    const choices = this.offered(node, n);
    if (choices.length > 0) return (this.step = { type: 'choices', node, choices });
    const to = this.wayOn(n);
    return to === null ? this.finish() : this.enter(to, hops + 1);
  }

  private offered(node: string, n: DialogueNode): ShownChoice[] {
    const out: ShownChoice[] = [];
    (n.choices ?? []).forEach((c: DialogueChoice, index) => {
      if (c.once && this.chosen.has(`${node}#${index}`)) return;
      const ok = c.if === undefined || this.test(c.if);
      if (!ok && !c.showLocked) return;
      out.push({ index, text: this.text(c.text, c.key), enabled: ok });
    });
    // only locked choices left is no choice at all: the player could not go on
    return out.some((c) => c.enabled) ? out : [];
  }

  private wayOn(n: DialogueNode): string | null {
    if (n.next === undefined) return null;
    if (typeof n.next === 'string') return n.next;
    for (const b of n.next) if (b.if === undefined || this.test(b.if)) return b.goto;
    return null;
  }

  private finish(): DialogueStep {
    this.node = null;
    return (this.step = { type: 'end' });
  }

  private nodeOf(name: string): DialogueNode {
    const n = this.script.nodes[name];
    if (!n) throw new Error(`dialogue: no node '${name}'`);
    return n;
  }

  private test(source: string): boolean {
    return !!expr(source)(this.scope);
  }

  private assign(set: Record<string, string> | undefined): void {
    if (!set) return;
    // every right side is read before any is written, so { a: "b", b: "a" } swaps
    const values = Object.entries(set).map(([name, source]) => [name, expr(source)(this.scope)] as const);
    for (const [name, v] of values) writePath(this.vars, name, v);
  }

  private run(commands: DialogueCommand[] | undefined): void {
    for (const c of commands ?? []) {
      const name = typeof c === 'string' ? c : c.name;
      this.options.onCommand?.(name, typeof c === 'string' ? [] : (c.args ?? []), this);
    }
  }

  /** `text` translated, with each `{expression}` replaced by its value; `{{` and `}}` are braces. */
  private text(text: string, key: string | undefined): string {
    const t = this.options.translate ? this.options.translate(text, key) : text;
    return t.replace(/\{\{|\}\}|\{([^{}]+)\}/g, (m, source: string | undefined) => {
      if (m === '{{') return '{';
      if (m === '}}') return '}';
      const v = expr(source!.trim())(this.scope);
      return v == null ? '' : String(v);
    });
  }
}

function readPath(vars: Record<string, unknown>, name: string): unknown {
  let v: unknown = vars;
  for (const part of name.split('.')) {
    if (v === null || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, part)) return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

function writePath(vars: Record<string, unknown>, name: string, value: unknown): void {
  const parts = name.split('.');
  let o = vars;
  for (const part of parts.slice(0, -1)) {
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') throw new Error(`dialogue: cannot set '${name}'`);
    const next = o[part];
    o = next !== null && typeof next === 'object' ? (next as Record<string, unknown>) : ((o[part] = {}) as Record<string, unknown>);
  }
  const last = parts[parts.length - 1]!;
  if (last === '__proto__' || last === 'constructor' || last === 'prototype') throw new Error(`dialogue: cannot set '${name}'`);
  o[last] = value;
}
