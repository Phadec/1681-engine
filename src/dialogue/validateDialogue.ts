import { compileExpr } from './expr';
import type { DialogueCommand, DialogueScript } from './script';

/** One fault in a script: where (`nodes.gate.choices[1].goto`), and what. */
export interface DialogueIssue {
  path: string;
  message: string;
  /** An error stops the dialogue when reached; a warning is likely a slip (a node nothing leads to). */
  level: 'error' | 'warning';
}

export interface ValidateOptions {
  /** The commands the game handles; when given, a `do` naming another is an error. */
  commands?: readonly string[];
  /** The functions the game registered, beside `visited` and `chose`; when given, a call to another is an error. */
  functions?: readonly string[];
}

/**
 * Checks a script without running it, for a test or an editor: every `goto` and `next` names a node, every condition,
 * assignment and `{…}` parses, commands and functions are known (when the lists are given), and every node can be
 * reached from the start.
 */
export function validateDialogue(script: DialogueScript, options: ValidateOptions = {}): DialogueIssue[] {
  const issues: DialogueIssue[] = [];
  const error = (path: string, message: string) => issues.push({ path, message, level: 'error' });
  const names = Object.keys(script.nodes ?? {});
  if (names.length === 0) {
    error('nodes', 'the script has no nodes');
    return issues;
  }
  const start = script.start ?? names[0]!;
  if (!script.nodes[start]) error('start', `no node '${start}'`);
  const fns = options.functions ? new Set(['visited', 'chose', ...options.functions]) : null;
  const expression = (path: string, source: unknown) => {
    if (typeof source !== 'string') return error(path, 'must be an expression in a string');
    try {
      compileExpr(source);
    } catch (e) {
      return error(path, (e as Error).message);
    }
    if (!fns) return;
    for (const m of source.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) if (!fns.has(m[1]!)) error(path, `no function '${m[1]}'`);
  };
  const text = (path: string, t: unknown) => {
    if (typeof t !== 'string') return error(path, 'must be text');
    for (const m of t.replace(/\{\{|\}\}/g, '').matchAll(/\{([^{}]*)\}/g)) expression(path, m[1]!.trim());
  };
  const target = (path: string, to: unknown) => {
    if (typeof to !== 'string' || !script.nodes[to]) error(path, `no node '${String(to)}'`);
  };
  const sets = (path: string, set: Record<string, string> | undefined) => {
    for (const [k, v] of Object.entries(set ?? {})) expression(`${path}.${k}`, v);
  };
  const commands = (path: string, list: DialogueCommand[] | undefined) => {
    (list ?? []).forEach((c, i) => {
      const name = typeof c === 'string' ? c : c?.name;
      if (typeof name !== 'string') error(`${path}[${i}]`, 'a command needs a name');
      else if (options.commands && !options.commands.includes(name)) error(`${path}[${i}]`, `no command '${name}'`);
    });
  };

  const edges = new Map<string, string[]>();
  for (const name of names) {
    const n = script.nodes[name]!;
    const at = `nodes.${name}`;
    const out: string[] = [];
    sets(`${at}.set`, n.set);
    commands(`${at}.do`, n.do);
    (n.lines ?? []).forEach((l, i) => {
      if (typeof l === 'string') return text(`${at}.lines[${i}]`, l);
      text(`${at}.lines[${i}].text`, l.text);
      if (l.if !== undefined) expression(`${at}.lines[${i}].if`, l.if);
    });
    (n.choices ?? []).forEach((c, i) => {
      const cp = `${at}.choices[${i}]`;
      text(`${cp}.text`, c.text);
      if (c.if !== undefined) expression(`${cp}.if`, c.if);
      sets(`${cp}.set`, c.set);
      commands(`${cp}.do`, c.do);
      if (c.goto !== undefined) {
        target(`${cp}.goto`, c.goto);
        out.push(c.goto);
      }
    });
    if (typeof n.next === 'string') {
      target(`${at}.next`, n.next);
      out.push(n.next);
    } else if (Array.isArray(n.next)) {
      n.next.forEach((b, i) => {
        if (b.if !== undefined) expression(`${at}.next[${i}].if`, b.if);
        target(`${at}.next[${i}].goto`, b.goto);
        out.push(b.goto);
      });
    }
    edges.set(name, out);
  }

  const reached = new Set<string>();
  const todo = script.nodes[start] ? [start] : [];
  while (todo.length) {
    const n = todo.pop()!;
    if (reached.has(n) || !script.nodes[n]) continue;
    reached.add(n);
    todo.push(...(edges.get(n) ?? []));
  }
  for (const name of names) if (!reached.has(name)) issues.push({ path: `nodes.${name}`, message: 'nothing leads here from the start', level: 'warning' });
  return issues;
}
