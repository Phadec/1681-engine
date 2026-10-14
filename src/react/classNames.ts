/** Joins class names, skipping empty ones. */
export type ClassJoiner = (...names: (string | false | null | undefined)[]) => string;

const PREFIX = 'e1681-';

/**
 * A joiner that hangs a game's own class names beside the kit's: every name it is given (split on spaces) is kept,
 * and followed by `classes[name without the kit's prefix]` when the game mapped it. Pure, so it is tested under node.
 *
 * ```ts
 * classJoiner({ tabs: 'tabs', button: 'btn', picked: 'active' })('e1681-button small', 'picked') // 'e1681-button btn small picked active'
 * ```
 */
export function classJoiner(classes: Readonly<Record<string, string>>): ClassJoiner {
  const mapped = Object.keys(classes).length > 0;
  return (...names) => {
    const out: string[] = [];
    for (const n of names) {
      if (!n) continue;
      for (const part of n.split(' ')) {
        if (!part) continue;
        out.push(part);
        if (!mapped) continue;
        const extra = classes[part.startsWith(PREFIX) ? part.slice(PREFIX.length) : part];
        if (extra) out.push(extra);
      }
    }
    return out.join(' ');
  };
}
