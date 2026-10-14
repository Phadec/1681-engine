/*
 * The small expression language dialogue conditions and assignments are written in — `gold >= 10 && !visited("intro")`,
 * `trust + 1` — parsed by hand and compiled to closures. No `eval`, no property access beyond dotted names read from
 * the variables: a script from a modder can read and set the variables it is given and call the functions the game
 * registered, nothing else.
 */

export type ExprValue = number | string | boolean | null | undefined;

/** What an expression reads: variables by (dotted) name, and the functions it may call. */
export interface ExprScope {
  get(name: string): unknown;
  call(name: string, args: ExprValue[]): ExprValue;
}

export type CompiledExpr = (scope: ExprScope) => ExprValue;

type Token = { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'id'; v: string } | { k: 'op'; v: string };

const OPS = ['&&', '||', '==', '!=', '<=', '>=', '<', '>', '!', '+', '-', '*', '/', '%', '(', ')', ','];

function lex(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) throw new Error(`bad number at ${i}`);
      out.push({ k: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new Error(`unclosed string at ${i}`);
      out.push({ k: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(src.slice(i))!;
      out.push({ k: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error(`unexpected '${c}' at ${i}`);
    out.push({ k: 'op', v: op });
    i += op.length;
  }
  return out;
}

const truthy = (v: ExprValue) => !!v;
/** Strict equality, but an unset variable equals null: `quest == null` reads as "never set". */
const same = (x: ExprValue, y: ExprValue) => x === y || (x == null && y == null);
const num = (v: ExprValue) => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : v == null ? 0 : Number(v));

/** Compiles `src`; throws with what and where on a syntax error. */
export function compileExpr(src: string): CompiledExpr {
  let toks: Token[];
  try {
    toks = lex(src);
  } catch (e) {
    throw new Error(`expression '${src}': ${(e as Error).message}`);
  }
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.k === 'op' && peek()!.v === v;
  const opIn = (ops: string[]) => {
    const t = peek();
    return t?.k === 'op' && ops.includes(t.v);
  };
  const fail = (why: string): never => {
    throw new Error(`expression '${src}': ${why}`);
  };
  const expect = (v: string) => (isOp(v) ? p++ : fail(`expected '${v}'`));

  const binary = (next: () => CompiledExpr, ops: string[], apply: (op: string, a: CompiledExpr, b: CompiledExpr) => CompiledExpr) => () => {
    let left = next();
    while (opIn(ops)) {
      const op = (toks[p++] as { v: string }).v;
      left = apply(op, left, next());
    }
    return left;
  };

  const primary = (): CompiledExpr => {
    const t = toks[p++];
    if (!t) return fail('ended early');
    if (t.k === 'num' || t.k === 'str') {
      const v = t.v;
      return () => v;
    }
    if (t.k === 'id') {
      const name = t.v;
      if (name === 'true') return () => true;
      if (name === 'false') return () => false;
      if (name === 'null') return () => null;
      if (isOp('(')) {
        p++;
        const args: CompiledExpr[] = [];
        while (!isOp(')')) {
          args.push(or());
          if (!isOp(',')) break;
          p++;
        }
        expect(')');
        return (s) => s.call(name, args.map((a) => a(s)));
      }
      return (s) => {
        const v = s.get(name);
        return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v == null ? (v as ExprValue) : String(v);
      };
    }
    if (t.v === '(') {
      const inner = or();
      expect(')');
      return inner;
    }
    return fail(`unexpected '${t.v}'`);
  };
  const unary = (): CompiledExpr => {
    if (isOp('!')) {
      p++;
      const a = unary();
      return (s) => !truthy(a(s));
    }
    if (isOp('-')) {
      p++;
      const a = unary();
      return (s) => -num(a(s));
    }
    return primary();
  };
  const term = binary(unary, ['*', '/', '%'], (op, a, b) =>
    op === '*' ? (s) => num(a(s)) * num(b(s)) : op === '/' ? (s) => num(a(s)) / num(b(s)) : (s) => num(a(s)) % num(b(s)),
  );
  // '+' joins text when either side is text, as a line's "you have " + gold would want
  const sum = binary(term, ['+', '-'], (op, a, b) =>
    op === '+'
      ? (s) => {
          const x = a(s);
          const y = b(s);
          return typeof x === 'string' || typeof y === 'string' ? `${x ?? ''}${y ?? ''}` : num(x) + num(y);
        }
      : (s) => num(a(s)) - num(b(s)),
  );
  const cmp = binary(sum, ['<', '>', '<=', '>=', '==', '!='], (op, a, b) => {
    switch (op) {
      case '==':
        return (s) => same(a(s), b(s));
      case '!=':
        return (s) => !same(a(s), b(s));
      case '<':
        return (s) => num(a(s)) < num(b(s));
      case '>':
        return (s) => num(a(s)) > num(b(s));
      case '<=':
        return (s) => num(a(s)) <= num(b(s));
      default:
        return (s) => num(a(s)) >= num(b(s));
    }
  });
  const and = binary(cmp, ['&&'], (_op, a, b) => (s) => truthy(a(s)) && truthy(b(s)));
  const or: () => CompiledExpr = binary(and, ['||'], (_op, a, b) => (s) => truthy(a(s)) || truthy(b(s)));

  if (toks.length === 0) fail('empty');
  const root = or();
  if (p < toks.length) fail(`unexpected '${(toks[p] as { v: unknown }).v}'`);
  return root;
}

const cache = new Map<string, CompiledExpr>();

/** `compileExpr`, kept: a script asks the same few conditions again and again. */
export function expr(src: string): CompiledExpr {
  let f = cache.get(src);
  if (!f) {
    f = compileExpr(src);
    if (cache.size > 2000) cache.clear();
    cache.set(src, f);
  }
  return f;
}
