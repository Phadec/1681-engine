import { SparseSet } from './SparseSet';
import { growColumns, isFields, type Columns, type FieldSpec, type FieldValues, type FieldsType } from './fields';

/**
 * An entity–component–system store. Entities are numbers; components are data kept in one sparse set per component
 * type; systems are functions run in the order they were added, each in a phase:
 *
 * - `fixed` runs once per simulation step (`FixedLoop`), for movement and rules;
 * - `frame` runs once per rendered frame, for drawing and anything purely visual.
 *
 * Storage is a sparse set per component (packed arrays, O(1) lookups), the layout fast ECS libraries use. For hot
 * loops prefer `each` (a callback, no allocation per entity) over `query` (an iterator yielding a fresh row).
 *
 * Entity ids are recycled: an id carries its slot index and a generation, so an id kept after its entity was
 * destroyed never matches the entity that later reuses the slot.
 *
 * Changing structure while walking: adding components is always safe (new entries are not visited this walk).
 * Removing a component or destroying an entity while a `query`, an `each` or a system run is in progress is deferred
 * until it ends, so nothing is skipped or visited twice.
 */

export type Entity = number;

/** A component type: a typed key. Make one per kind of data with `defineComponent`. */
export interface ComponentType<T> {
  readonly id: number;
  readonly name: string;
  /** Phantom field carrying `T`; never set. */
  readonly __type?: T;
}

let nextComponentId = 0;
/** Every component type made, by id: what a debugger names a store by. */
const TYPES: ComponentType<unknown>[] = [];

export function defineComponent<T>(name: string): ComponentType<T> {
  const type = { id: nextComponentId++, name };
  TYPES[type.id] = type;
  return type;
}

/** A component of numeric fields kept in typed-array columns (`fields.ts`): the fast form for data every body has. */
export function defineFields<const S extends FieldSpec>(name: string, fields: S): FieldsType<S> {
  const type = { id: nextComponentId++, name, fields };
  TYPES[type.id] = type;
  return type;
}

export type SystemPhase = 'fixed' | 'frame';

export interface SystemContext {
  world: World;
  /** Seconds this run covers: one step in `fixed`, the frame's length in `frame`. */
  dt: number;
  /** `performance.now()` of the frame. */
  now: number;
  /** In `frame`: the share of a step since the last fixed step (0–1), for interpolation. 0 in `fixed`. */
  alpha: number;
}

export interface System {
  readonly name: string;
  readonly phase: SystemPhase;
  run(ctx: SystemContext): void;
  /** Called when the system is taken out of its world (or the world is cleared). */
  dispose?(): void;
}

/** A system from a function. */
export function system(name: string, phase: SystemPhase, run: (ctx: SystemContext) => void): System {
  return { name, phase, run };
}

export type ComponentValues<T extends readonly ComponentType<unknown>[]> = { [K in keyof T]: T[K] extends ComponentType<infer V> ? V : never };

/** Slot index in the low 22 bits (4 million live entities), generation above. */
const INDEX_BITS = 22;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
const MAX_GENERATION = 2 ** 31;

/** The slot an entity id sits in. */
export const entityIndex = (e: Entity): number => e & INDEX_MASK;

type Pending = { kind: 'destroy'; e: Entity } | { kind: 'remove'; e: Entity; type: ComponentType<unknown> };

export class World {
  /** Current generation per slot; an id is alive when its generation matches and the slot is in use. */
  private generations: number[] = [];
  private readonly inUse: boolean[] = [];
  private readonly free: number[] = [];
  private live = 0;
  private readonly stores: (SparseSet<unknown> | undefined)[] = [];
  /** Typed-array columns of the field components, by component id. */
  private readonly cols: (Record<string, ArrayLike<number>> | undefined)[] = [];
  private readonly systems: System[] = [];
  private readonly pending: Pending[] = [];
  /** `slots` results by the component ids asked for, rebuilt only when one of those sets changed membership. */
  private readonly slotCache = new Map<string, { versions: number[]; slots: Int32Array; view: Int32Array }>();
  /** Walks (`query`, `each`, system runs) in progress: structure changes wait until it is 0. */
  private walking = 0;

  /** A new entity with no components. */
  create(): Entity {
    let index: number;
    if (this.free.length) {
      index = this.free.pop()!;
    } else {
      index = this.generations.length;
      if (index > INDEX_MASK) throw new Error('World: too many live entities');
      this.generations.push(0);
      this.inUse.push(false);
    }
    this.inUse[index] = true;
    this.live++;
    return this.generations[index]! * (INDEX_MASK + 1) + index;
  }

  /** A new entity with these components. */
  spawn(...components: [ComponentType<unknown>, unknown][]): Entity {
    const e = this.create();
    for (const [type, value] of components) this.add(e, type, value);
    return e;
  }

  isAlive(e: Entity): boolean {
    const index = entityIndex(e);
    return this.inUse[index] === true && this.generations[index] === Math.floor(e / (INDEX_MASK + 1));
  }

  /** Every live entity, for tools (a debugger, a save); allocates, so not for a per-frame path. */
  entities(): Entity[] {
    const out: Entity[] = [];
    for (let i = 0; i < this.inUse.length; i++) if (this.inUse[i]) out.push(this.generations[i]! * (INDEX_MASK + 1) + i);
    return out;
  }

  /** The component types `e` holds, for tools; allocates. */
  componentsOf(e: Entity): ComponentType<unknown>[] {
    if (!this.isAlive(e)) return [];
    const index = entityIndex(e);
    const out: ComponentType<unknown>[] = [];
    this.stores.forEach((store, id) => {
      if (store?.has(index)) out.push(TYPES[id]!);
    });
    return out;
  }

  /** Live entities. */
  get size(): number {
    return this.live;
  }

  /** Removes an entity and every component it had (deferred while a walk is in progress). */
  destroy(e: Entity): void {
    if (!this.isAlive(e)) return;
    if (this.walking > 0) {
      this.pending.push({ kind: 'destroy', e });
      return;
    }
    const index = entityIndex(e);
    for (const store of this.stores) store?.delete(index, entityIndex);
    this.inUse[index] = false;
    this.generations[index] = (this.generations[index]! + 1) % MAX_GENERATION;
    this.free.push(index);
    this.live--;
  }

  /** Gives an entity a field component; fields left out start at 0. Returns the slot index into its columns. */
  add<S extends FieldSpec>(e: Entity, type: FieldsType<S>, values?: FieldValues<S>): number;
  add<T>(e: Entity, type: ComponentType<T>, value: T): T;
  add(e: Entity, type: ComponentType<unknown>, value?: unknown): unknown {
    if (!this.isAlive(e)) throw new Error(`World.add: entity ${e} is not alive`);
    const index = entityIndex(e);
    if (isFields(type)) {
      const cols = this.columnsOf(type, index + 1) as Record<string, { [i: number]: number }>;
      const values = (value ?? {}) as Record<string, number>;
      for (const name of Object.keys(type.fields)) cols[name]![index] = values[name] ?? 0;
      this.store(type).set(index, e, index);
      return index;
    }
    this.store(type).set(index, e, value);
    return value;
  }

  /**
   * The typed-array columns of a field component, indexed by slot. Fetch them per system run: adding entities may
   * grow them into new arrays.
   */
  columns<S extends FieldSpec>(type: FieldsType<S>): Columns<S> {
    return this.columnsOf(type, this.generations.length) as unknown as Columns<S>;
  }

  get<T>(e: Entity, type: ComponentType<T>): T | undefined {
    if (!this.isAlive(e)) return undefined;
    return this.stores[type.id]?.get(entityIndex(e)) as T | undefined;
  }

  /** The component, or an error naming what is missing: for code that knows the entity has it. */
  require<T>(e: Entity, type: ComponentType<T>): T {
    const store = this.stores[type.id];
    if (!this.isAlive(e) || !store?.has(entityIndex(e))) throw new Error(`World.require: entity ${e} has no ${type.name}`);
    return store.get(entityIndex(e)) as T;
  }

  has(e: Entity, type: ComponentType<unknown>): boolean {
    return this.isAlive(e) && (this.stores[type.id]?.has(entityIndex(e)) ?? false);
  }

  /** Takes one component off an entity (deferred while a walk is in progress). */
  remove(e: Entity, type: ComponentType<unknown>): void {
    if (!this.isAlive(e)) return;
    if (this.walking > 0) {
      this.pending.push({ kind: 'remove', e, type });
      return;
    }
    this.stores[type.id]?.delete(entityIndex(e), entityIndex);
  }

  /** How many entities hold `type`. */
  count(type: ComponentType<unknown>): number {
    return this.stores[type.id]?.size ?? 0;
  }

  /**
   * Calls `fn(entity, ...components)` for every live entity holding all of `types`. Allocates nothing per entity:
   * the form for systems that walk thousands of bodies every step.
   */
  each<const T extends readonly ComponentType<unknown>[]>(...args: [...types: T, fn: (e: Entity, ...values: ComponentValues<T>) => void]): void {
    const fn = args[args.length - 1] as (e: Entity, ...values: unknown[]) => void;
    const types = args.slice(0, -1) as unknown as T;
    const sets = this.setsFor(types);
    if (!sets) return;
    const lead = smallest(sets);
    const n = lead.entities.length;
    this.walking++;
    try {
      if (sets.length === 1) {
        for (let i = n - 1; i >= 0; i--) fn(lead.entities[i]!, lead.values[i]);
      } else if (sets.length === 2) {
        const [a, b] = sets as [SparseSet<unknown>, SparseSet<unknown>];
        for (let i = n - 1; i >= 0; i--) {
          const e = lead.entities[i]!;
          const index = entityIndex(e);
          if (!a.has(index) || !b.has(index)) continue;
          fn(e, a.get(index), b.get(index));
        }
      } else {
        const row: unknown[] = new Array(sets.length);
        for (let i = n - 1; i >= 0; i--) {
          const e = lead.entities[i]!;
          const index = entityIndex(e);
          let all = true;
          for (let s = 0; s < sets.length; s++) {
            const set = sets[s]!;
            if (!set.has(index)) {
              all = false;
              break;
            }
            row[s] = set.get(index);
          }
          if (all) fn(e, ...row);
        }
      }
    } finally {
      this.endWalk();
    }
  }

  /**
   * The slot index of every entity holding all of `types`, as a typed array: the fastest walk there is, made for
   * field components (`defineFields`), whose columns are indexed by slot.
   *
   * ```ts
   * const p = world.columns(Position), v = world.columns(Velocity);
   * const slots = world.slots(Position, Velocity);
   * for (let k = 0; k < slots.length; k++) { const i = slots[k]!; p.x[i]! += v.x[i]! * dt; }
   * ```
   *
   * The result is cached and rebuilt only when an entity joins or leaves one of those components, so asking every
   * step is cheap. It is a view the world owns: read it, don't keep it past the step, and fetch it again after
   * adding or removing components.
   */
  slots(...types: ComponentType<unknown>[]): Int32Array {
    const key = types.map((t) => t.id).join(',');
    const sets = this.setsFor(types);
    if (!sets) return EMPTY_SLOTS;
    let cached = this.slotCache.get(key);
    if (cached && cached.versions.every((v, k) => v === sets[k]!.version)) return cached.view;
    const lead = smallest(sets);
    const out = cached && cached.slots.length >= lead.size ? cached.slots : new Int32Array(Math.max(16, lead.size));
    let n = 0;
    for (let d = 0; d < lead.entities.length; d++) {
      const index = entityIndex(lead.entities[d]!);
      let all = true;
      for (const set of sets) {
        if (set !== lead && !set.has(index)) {
          all = false;
          break;
        }
      }
      if (all) out[n++] = index;
    }
    cached = { versions: sets.map((x) => x.version), slots: out, view: out.subarray(0, n) };
    this.slotCache.set(key, cached);
    return cached.view;
  }

  /**
   * Every live entity holding all of `types`, with those components in the same order. Yields a fresh row per
   * entity: convenient, but `each` is the form for hot loops.
   */
  *query<const T extends readonly ComponentType<unknown>[]>(...types: T): IterableIterator<[Entity, ...ComponentValues<T>]> {
    const sets = this.setsFor(types);
    if (!sets) return;
    const lead = smallest(sets);
    this.walking++;
    try {
      for (let i = lead.entities.length - 1; i >= 0; i--) {
        const e = lead.entities[i]!;
        const index = entityIndex(e);
        const row: unknown[] = [e];
        let all = true;
        for (const set of sets) {
          if (!set.has(index)) {
            all = false;
            break;
          }
          row.push(set.get(index));
        }
        if (all) yield row as [Entity, ...ComponentValues<T>];
      }
    } finally {
      this.endWalk();
    }
  }

  /** The first entity matching the query, or undefined: for singletons (the player, the camera target). */
  first<const T extends readonly ComponentType<unknown>[]>(...types: T): [Entity, ...ComponentValues<T>] | undefined {
    for (const row of this.query(...types)) return row;
    return undefined;
  }

  addSystem(s: System): this {
    if (this.systems.some((x) => x.name === s.name)) throw new Error(`World.addSystem: a system named "${s.name}" is already added`);
    this.systems.push(s);
    return this;
  }

  removeSystem(name: string): void {
    const i = this.systems.findIndex((s) => s.name === name);
    if (i < 0) return;
    const [s] = this.systems.splice(i, 1);
    s!.dispose?.();
  }

  /** Runs every system of `phase` in the order added. A system that throws is reported and the rest still run. */
  run(phase: SystemPhase, ctx: Omit<SystemContext, 'world'>, onError?: (system: System, err: unknown) => void): void {
    const full: SystemContext = { dt: ctx.dt, now: ctx.now, alpha: ctx.alpha, world: this };
    this.walking++;
    try {
      for (const s of this.systems) {
        if (s.phase !== phase) continue;
        try {
          s.run(full);
        } catch (err) {
          if (onError) onError(s, err);
          else throw err;
        }
      }
    } finally {
      this.endWalk();
    }
  }

  /** Every entity, component and system gone. */
  clear(): void {
    for (const s of this.systems.splice(0)) s.dispose?.();
    for (const store of this.stores) store?.clear();
    this.generations = this.generations.map((g) => (g + 1) % MAX_GENERATION);
    this.inUse.fill(false);
    this.free.length = 0;
    for (let i = this.generations.length - 1; i >= 0; i--) this.free.push(i);
    this.live = 0;
    this.pending.length = 0;
    this.slotCache.clear();
  }

  private columnsOf(type: FieldsType<FieldSpec>, slots: number): Record<string, ArrayLike<number>> {
    let cols = this.cols[type.id];
    const have = cols ? (Object.values(cols)[0]?.length ?? 0) : 0;
    if (!cols || have < slots) {
      let n = Math.max(64, have);
      while (n < slots) n *= 2;
      cols = growColumns(type.fields, n, cols);
      this.cols[type.id] = cols;
    }
    return cols;
  }

  private store<T>(type: ComponentType<T>): SparseSet<unknown> {
    let s = this.stores[type.id];
    if (!s) {
      s = new SparseSet<unknown>();
      this.stores[type.id] = s;
    }
    return s;
  }

  /** The stores for `types`, or null when one has never been used (so nothing can match). */
  private setsFor(types: readonly ComponentType<unknown>[]): SparseSet<unknown>[] | null {
    if (types.length === 0) return null;
    const sets: SparseSet<unknown>[] = [];
    for (const t of types) {
      const s = this.stores[t.id];
      if (!s || s.size === 0) return null;
      sets.push(s);
    }
    return sets;
  }

  private endWalk(): void {
    this.walking--;
    if (this.walking > 0 || this.pending.length === 0) return;
    const pending = this.pending.splice(0);
    for (const p of pending) {
      if (p.kind === 'destroy') this.destroy(p.e);
      else this.remove(p.e, p.type);
    }
  }
}

const EMPTY_SLOTS = new Int32Array(0);

function smallest(sets: SparseSet<unknown>[]): SparseSet<unknown> {
  let lead = sets[0]!;
  for (const s of sets) if (s.size < lead.size) lead = s;
  return lead;
}
