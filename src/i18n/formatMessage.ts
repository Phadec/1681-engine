/** The separator between a source string and its context: `'Open|door'` and `'Open|file'` are two keys. */
export const CONTEXT_MARK = '|';

/** The text a key shows untranslated: the source without its `|context`. */
export function sourceText(key: string): string {
  const i = key.lastIndexOf(CONTEXT_MARK);
  return i < 0 ? key : key.slice(0, i);
}

/**
 * Fills `{0}`, `{1}`… with `args`. A placeholder with no argument is left as written, so a missing argument shows
 * where it is instead of printing "undefined". `{{` and `}}` print a literal brace.
 */
export function formatMessage(text: string, args: readonly unknown[]): string {
  if (text.indexOf('{') < 0 && text.indexOf('}') < 0) return text;
  return text.replace(/\{\{|\}\}|\{(\d+)\}/g, (m, index: string | undefined) => {
    if (m === '{{') return '{';
    if (m === '}}') return '}';
    const i = Number(index);
    return i < args.length ? String(args[i]) : m;
  });
}
