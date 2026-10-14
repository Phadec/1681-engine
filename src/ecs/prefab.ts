import type { FieldSpec, FieldsType, FieldValues } from './fields';
import type { ComponentType, Entity, World } from './World';

/** What a prefab's factory values are given: the entity being made and the spawn's own `args`. */
export interface PrefabContext<A> {
  entity: Entity;
  args: A;
}

/**
 * A component's value in a prefab: plain data (copied afresh for every entity, so no two share an object), or a
 * factory called once per entity, for what cannot be copied (a class instance, a sprite) or must differ (a random
 * roll, a position from the spawn's args). `null` in a variant takes away a component its base has.
 */
export type PrefabValue<T, A = unknown> = T | ((ctx: PrefabContext<A>) => T);

export type PrefabPart<A = unknown> = readonly [ComponentType<unknown>, PrefabValue<unknown, A> | null];

/**
 * One part of a prefab, typed: the value is checked against the component's type, and a factory's `ctx` is known.
 * A bare `[type, value]` tuple works too, unchecked.
 */
export function prefabPart<S extends FieldSpec, A = unknown>(type: FieldsType<S>, value: PrefabValue<FieldValues<S>, A> | null): PrefabPart<A>;
export function prefabPart<T, A = unknown>(type: ComponentType<T>, value: PrefabValue<T, A> | null): PrefabPart<A>;
export function prefabPart<A>(type: ComponentType<unknown>, value: PrefabValue<unknown, A> | null): PrefabPart<A> {
  return [type, value];
}

/** A template for entities: the components each gets, with their starting values. */
export interface Prefab<A = unknown> {
  readonly name: string;
  /** The components, the base's merged in: a variant's plain-object values are laid over the base's field by field. */
  readonly parts: ReadonlyMap<ComponentType<unknown>, PrefabValue<unknown, A>>;
  readonly base: Prefab<A> | null;
}

export interface PrefabOptions<A> {
  /** The prefab this is a variant of: everything it has, with these parts laid over. */
  extends?: Prefab<A>;
}

/**
 * Defines a prefab.
 *
 * ```ts
 * const Monster = definePrefab('monster', [prefabPart(Health, { hp: 10, max: 10 }), prefabPart(Brain, () => tree.agent())]);
 * const Boss = definePrefab('boss', [prefabPart(Health, { hp: 200, max: 200 }), prefabPart(Flying, null)], { extends: Monster });
 * spawnPrefab(world, Boss, { with: [[Position, { x: 40, y: 80 }]] });
 * ```
 */
export function definePrefab<A = unknown>(name: string, parts: readonly PrefabPart<A>[], options: PrefabOptions<A> = {}): Prefab<A> {
  const base = options.extends ?? null;
  const merged = new Map(base?.parts ?? []);
  for (const [type, value] of parts) {
    if (value === null) merged.delete(type);
    else merged.set(type, layer(merged.get(type), value));
  }
  return { name, parts: merged, base };
}

export interface SpawnOptions<A> {
  /** Components added or replaced for this entity only (laid over the prefab's like a variant's). */
  with?: readonly PrefabPart<A>[];
  /** Components of the prefab this entity goes without. */
  without?: readonly ComponentType<unknown>[];
  /** Handed to every factory value. */
  args?: A;
}

/** Makes one entity from a prefab: each component's value copied, or made by its factory. */
export function spawnPrefab<A = unknown>(world: World, prefab: Prefab<A>, options: SpawnOptions<A> = {}): Entity {
  const parts = options.with?.length ? definePrefab(prefab.name, options.with, { extends: prefab }).parts : prefab.parts;
  const e = world.create();
  const ctx: PrefabContext<A> = { entity: e, args: options.args as A };
  for (const [type, value] of parts) {
    if (options.without?.includes(type)) continue;
    world.add(e, type, valueOf(value, ctx));
  }
  return e;
}

/** Whether `prefab` is `of` or a variant of it, however far down. */
export function isPrefabOf(prefab: Prefab<never> | Prefab<unknown>, of: Prefab<never> | Prefab<unknown>): boolean {
  for (let p: Prefab<unknown> | null = prefab as Prefab<unknown>; p; p = p.base) if (p === of) return true;
  return false;
}

function valueOf<A>(value: PrefabValue<unknown, A>, ctx: PrefabContext<A>): unknown {
  if (typeof value === 'function') return (value as (c: PrefabContext<A>) => unknown)(ctx);
  // plain data, fresh for each entity: two goblins never share one stats object
  return value !== null && typeof value === 'object' ? structuredClone(value) : value;
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** A variant's value over its base's: plain objects merged field by field, anything else replaces. */
function layer(under: unknown, over: unknown): unknown {
  if (!isPlain(under) || !isPlain(over)) return over;
  const out: Record<string, unknown> = { ...under };
  for (const [k, v] of Object.entries(over)) out[k] = layer(under[k], v);
  return out;
}

/** Prefabs as data: `{ "goblin": { "extends": "monster", "components": { "Health": { "hp": 6 }, "Flying": null } } }`. */
export type PrefabData = Record<string, { extends?: string; components?: Record<string, unknown> }>;

/**
 * Prefabs by name, loadable from data a designer edits. Components are named through `component(name, type)`;
 * a value in the data is plain JSON, so factories (a sprite, a brain) are given in code with `factory`.
 */
export class PrefabLibrary {
  private readonly types = new Map<string, ComponentType<unknown>>();
  private readonly factories = new Map<string, Map<ComponentType<unknown>, PrefabValue<unknown>>>();
  private readonly prefabs = new Map<string, Prefab>();

  /** Lets data name a component type. */
  component(name: string, type: ComponentType<unknown>): this {
    this.types.set(name, type);
    return this;
  }

  /** A value made in code for a prefab loaded from data (and its variants): the data cannot hold a function. */
  factory<T>(prefab: string, type: ComponentType<T>, make: (ctx: PrefabContext<unknown>) => T): this {
    let m = this.factories.get(prefab);
    if (!m) this.factories.set(prefab, (m = new Map()));
    m.set(type, make as PrefabValue<unknown>);
    return this;
  }

  /** Adds a prefab made in code. */
  add(prefab: Prefab): this {
    this.prefabs.set(prefab.name, prefab);
    return this;
  }

  /**
   * Builds the prefabs of `data`, bases before their variants (in any order in the data), and adds them. Throws,
   * naming the prefab, on an unknown component or base, or a prefab that extends itself.
   */
  load(data: PrefabData): this {
    const built = new Map<string, Prefab>();
    const building = new Set<string>();
    const build = (name: string): Prefab => {
      const done = built.get(name);
      if (done) return done;
      const spec = data[name];
      // a base outside this data: one loaded before, or made in code
      if (!spec) return this.get(name);
      if (building.has(name)) throw new Error(`PrefabLibrary: '${name}' extends itself`);
      building.add(name);
      const base = spec.extends === undefined ? undefined : build(spec.extends);
      const parts: PrefabPart[] = Object.entries(spec.components ?? {}).map(([cname, value]) => {
        const type = this.types.get(cname);
        if (!type) throw new Error(`PrefabLibrary: '${name}' names an unknown component '${cname}'`);
        return [type, value as PrefabValue<unknown> | null];
      });
      for (const [type, make] of this.factories.get(name) ?? []) parts.push([type, make]);
      const prefab = definePrefab(name, parts, { extends: base });
      building.delete(name);
      built.set(name, prefab);
      return prefab;
    };
    for (const name of Object.keys(data)) build(name);
    for (const [name, prefab] of built) this.prefabs.set(name, prefab);
    return this;
  }

  get(name: string): Prefab {
    const p = this.prefabs.get(name);
    if (!p) throw new Error(`PrefabLibrary: no prefab '${name}'`);
    return p;
  }

  has(name: string): boolean {
    return this.prefabs.has(name);
  }

  names(): string[] {
    return [...this.prefabs.keys()];
  }

  /** `spawnPrefab` by name. */
  spawn<A = unknown>(world: World, name: string, options: SpawnOptions<A> = {}): Entity {
    return spawnPrefab(world, this.get(name) as Prefab<A>, options);
  }
}
