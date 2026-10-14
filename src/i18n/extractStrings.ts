/** One translatable string found in source text. */
export interface ExtractedString {
  /** The catalog key: the string as written, `|context` included. */
  key: string;
  /** For a plural call, the singular form written beside the key. */
  one?: string;
  /** The function it was passed to. */
  fn: string;
  /** 1-based line of the call. */
  line: number;
}

export interface ExtractOptions {
  /** Functions whose first argument is a key (default `['tr']`). */
  single?: readonly string[];
  /** Functions called `(one, other, count…)`, keyed by `other` (default `['trn']`). */
  plural?: readonly string[];
}

/**
 * Finds the strings passed to `tr('…')` (and `trn('…', '…', n)`) in a file's text, for a tool that lists keys
 * missing from a catalog or drops unused ones. A plain scanner, not a parser: it reads a string literal straight
 * after the call's parenthesis (quotes of any kind, escapes decoded) and skips a template literal with `${…}` in it
 * or a call whose key is not a literal, since neither can be a catalog key. A call inside a comment is still found.
 */
export function extractStrings(text: string, options: ExtractOptions = {}): ExtractedString[] {
  const single = options.single ?? ['tr'];
  const plural = options.plural ?? ['trn'];
  const names = [...single, ...plural].map((n) => n.replace(/[$.*+?^()[\]{}|\\]/g, '\\$&'));
  if (names.length === 0) return [];
  const call = new RegExp(`(?<![\\w$])(${names.join('|')})\\s*\\(`, 'g');
  const out: ExtractedString[] = [];
  let line = 1;
  let scanned = 0;
  for (const m of text.matchAll(call)) {
    const fn = m[1]!;
    const first = readString(text, m.index + m[0].length);
    if (!first) continue;
    for (; scanned < m.index; scanned++) if (text.charCodeAt(scanned) === 10) line++;
    if (!plural.includes(fn)) {
      out.push({ key: first.value, fn, line });
      continue;
    }
    let i = skipSpace(text, first.end);
    if (text[i] !== ',') continue;
    const second = readString(text, i + 1);
    if (second) out.push({ key: second.value, one: first.value, fn, line });
  }
  return out;
}

function skipSpace(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i]!)) i++;
  return i;
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };

/** The string literal starting at `from` (after spaces), decoded, and the index after its closing quote. */
function readString(text: string, from: number): { value: string; end: number } | null {
  const start = skipSpace(text, from);
  const quote = text[start];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let value = '';
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i]!;
    if (c === quote) return { value, end: i + 1 };
    if (quote !== '`' && c === '\n') return null;
    if (quote === '`' && c === '$' && text[i + 1] === '{') return null;
    if (c !== '\\') {
      value += c;
      continue;
    }
    const e = text[++i];
    if (e === undefined) return null;
    if (e === '\n') continue; // a line continuation
    if (e === 'u' || e === 'x') {
      const braced = e === 'u' && text[i + 1] === '{';
      const hex = braced ? text.slice(i + 2, text.indexOf('}', i)) : text.slice(i + 1, i + (e === 'u' ? 5 : 3));
      const code = Number.parseInt(hex, 16);
      if (Number.isNaN(code)) return null;
      value += String.fromCodePoint(code);
      i += braced ? hex.length + 2 : hex.length;
      continue;
    }
    value += ESCAPES[e] ?? e;
  }
  return null;
}
