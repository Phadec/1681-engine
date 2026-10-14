/**
 * Weather rolled from wall time alone, so two players standing in the same place are rained on together without a
 * packet between them. Pure and deterministic: the same key, time and table give the same sky on every machine.
 *
 * Time is cut into slots; each slot rolls one entry of a weighted list from a hash of the key and the slot number,
 * and a change of kind fades out at the end of its slot and in at the start of the next. Places can share one sky:
 * a key listed in a `skies` group takes its kind from the group's roll (so the rain does not stop at a map's edge)
 * and only its strength from its own list. The kind `'clear'` means no weather and has no strength.
 *
 * ```ts
 * const TABLE: WeatherTable = {
 *   slotMs: 12 * 60_000,
 *   fadeMs: 40_000,
 *   places: { meadow: [{ kind: 'clear', weight: 4 }, { kind: 'rain', weight: 3, intensity: [0.4, 1] }] },
 * };
 * const w = weatherAt('meadow', serverNow(), TABLE); // { kind: 'rain', intensity: 0.7 }
 * ```
 */

export interface WeatherEntry<K extends string = string> {
  kind: K | 'clear';
  weight: number;
  /** The strength range rolled for this kind, [lo, hi] in 0..1 (default [1, 1]). */
  intensity?: readonly [number, number];
}

export interface WeatherSky<K extends string = string> {
  /** The place keys under this sky. */
  places: readonly string[];
  entries: readonly WeatherEntry<K>[];
}

export interface WeatherTable<K extends string = string> {
  /** How long one roll of the sky lasts. */
  slotMs: number;
  /** How long a change of kind takes to fade out and in. */
  fadeMs: number;
  /** Each place's own list; a place with none (a cave) has no weather, even inside a sky. */
  places: Readonly<Record<string, readonly WeatherEntry<K>[]>>;
  /** Groups of neighbouring places that share one sky, by group id. */
  skies?: Readonly<Record<string, WeatherSky<K>>>;
}

export interface WeatherState<K extends string = string> {
  kind: K | 'clear';
  /** 0..1, already faded round a change of kind; 0 when clear. */
  intensity: number;
}

const CLEAR: WeatherState<never> = { kind: 'clear', intensity: 0 };

/** FNV-1a over the text, then an avalanche: a stable number in [0, 1). */
export function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** The sky group each place belongs to, worked out once per table. */
const SKY_OF = new WeakMap<object, Map<string, string>>();

function skyOf(table: WeatherTable<string>, key: string): string | undefined {
  if (!table.skies) return undefined;
  let map = SKY_OF.get(table);
  if (!map) {
    map = new Map();
    for (const [id, sky] of Object.entries(table.skies)) for (const p of sky.places) map.set(p, id);
    SKY_OF.set(table, map);
  }
  return map.get(key);
}

function roll<K extends string>(seed: string, entries: readonly WeatherEntry<K>[], slot: number): WeatherState<K> {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return CLEAR;
  let r = hash01(`${seed}:${slot}`) * total;
  let pick = entries[entries.length - 1]!;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) {
      pick = e;
      break;
    }
  }
  if (pick.kind === 'clear') return CLEAR;
  const [lo, hi] = pick.intensity ?? [1, 1];
  return { kind: pick.kind, intensity: lo + (hi - lo) * hash01(`${seed}:${slot}:i`) };
}

/** The weather over place `key` at wall time `ms`. */
export function weatherAt<K extends string>(key: string, ms: number, table: WeatherTable<K>): WeatherState<K> {
  const own = table.places[key] ?? [];
  if (!own.length) return CLEAR;
  const group = skyOf(table, key);
  const seed = group === undefined ? key : `sky:${group}`;
  const entries = group === undefined ? own : table.skies![group]!.entries;
  if (!entries.length) return CLEAR;
  const slot = Math.floor(ms / table.slotMs);
  let now = roll(seed, entries, slot);
  if (now.kind === 'clear') return now;
  // a shared sky's kind at the strength this place feels it: its own range for that kind when its list has one
  if (group !== undefined) {
    const range = own.find((e) => e.kind === now.kind)?.intensity;
    if (range) now = { kind: now.kind, intensity: range[0] + (range[1] - range[0]) * hash01(`${seed}:${slot}:i`) };
  }
  const into = ms - slot * table.slotMs;
  const left = table.slotMs - into;
  let fade = 1;
  if (table.fadeMs > 0) {
    if (roll(seed, entries, slot - 1).kind !== now.kind) fade = Math.min(fade, into / table.fadeMs);
    if (roll(seed, entries, slot + 1).kind !== now.kind) fade = Math.min(fade, left / table.fadeMs);
  }
  return { kind: now.kind, intensity: now.intensity * Math.max(0, Math.min(1, fade)) };
}
