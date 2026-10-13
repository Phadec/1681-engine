/**
 * A small entity–component–system store. Entities are numbers; components are plain data kept in one map per
 * component type; systems are functions run in the order they were added, each in a phase:
 *
 * - `fixed` runs once per simulation step (`FixedLoop`), for movement and rules;
 * - `frame` runs once per rendered frame, for drawing and anything purely visual.
 *
 * Deliberately simple: no archetypes or chunked storage. A query walks the smallest component map it names, which is
 * fast enough for the few thousand bodies a 2D game keeps alive.
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

export function defineComponent<T>(name: string): ComponentType<T> {
  return { id: nextComponentId++, name };
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

type Tuple<T extends readonly ComponentType<unknown>[]> = { [K in keyof T]: T[K] extends ComponentType<infer V> ? V : never };

export class World {
  private nextEntity = 1;
  private readonly alive = new Set<Entity>();
  private readonly stores = new Map<number, Map<Entity, unknown>>();
  private readonly systems: System[] = [];
  /** Entities destroyed while systems run are removed after the run, so a query never sees one vanish under it. */
  private readonly doomed: Entity[] = [];
  private running = 0;

  /** A new entity with no components. */
  create(): Entity {
    const e = this.nextEntity++;
    this.alive.add(e);
    return e;
  }

  /** A new entity with these components. */
  spawn(...components: [ComponentType<unknown>, unknown][]): Entity {
    const e = this.create();
    for (const [type, value] of components) this.add(e, type as ComponentType<unknown>, value);
    return e;
  }

  isAlive(e: Entity): boolean {
    return this.alive.has(e);
  }

  get size(): number {
    return this.alive.size;
  }

  /** Removes an entity and every component it had (deferred to the end of the run when systems are running). */
  destroy(e: Entity): void {
    if (!this.alive.has(e)) return;
    if (this.running > 0) {
      this.doomed.push(e);
      return;
    }
    this.alive.delete(e);
    for (const store of this.stores.values()) store.delete(e);
  }

  add<T>(e: Entity, type: ComponentType<T>, value: T): T {
    if (!this.alive.has(e)) throw new Error(`World.add: entity ${e} is not alive`);
    this.store(type).set(e, value);
    return value;
  }

  get<T>(e: Entity, type: ComponentType<T>): T | undefined {
    return this.stores.get(type.id)?.get(e) as T | undefined;
  }

  /** The component, or an error naming what is missing: for code that knows the entity has it. */
  require<T>(e: Entity, type: ComponentType<T>): T {
    const store = this.stores.get(type.id);
    if (!store?.has(e)) throw new Error(`World.require: entity ${e} has no ${type.name}`);
    return store.get(e) as T;
  }

  has(e: Entity, type: ComponentType<unknown>): boolean {
    return this.stores.get(type.id)?.has(e) ?? false;
  }

  remove(e: Entity, type: ComponentType<unknown>): void {
    this.stores.get(type.id)?.delete(e);
  }

  /** Every live entity holding all of `types`, with those components in the same order. */
  *query<const T extends readonly ComponentType<unknown>[]>(...types: T): IterableIterator<[Entity, ...Tuple<T>]> {
    if (types.length === 0) return;
    const stores = types.map((t) => this.stores.get(t.id));
    if (stores.some((s) => !s)) return;
    const present = stores as Map<Entity, unknown>[];
    let smallest = present[0]!;
    for (const s of present) if (s.size < smallest.size) smallest = s;
    // a snapshot of the keys: a system may add or remove components of the type it walks
    for (const e of [...smallest.keys()]) {
      if (!this.alive.has(e)) continue;
      const row: unknown[] = [e];
      let all = true;
      for (const s of present) {
        if (!s.has(e)) {
          all = false;
          break;
        }
        row.push(s.get(e));
      }
      if (all) yield row as [Entity, ...Tuple<T>];
    }
  }

  /** The first entity matching the query, or undefined: for singletons (the player, the camera target). */
  first<const T extends readonly ComponentType<unknown>[]>(...types: T): [Entity, ...Tuple<T>] | undefined {
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
    this.running++;
    try {
      for (const s of this.systems) {
        if (s.phase !== phase) continue;
        try {
          s.run({ ...ctx, world: this });
        } catch (err) {
          if (onError) onError(s, err);
          else throw err;
        }
      }
    } finally {
      this.running--;
      if (this.running === 0 && this.doomed.length) {
        const doomed = this.doomed.splice(0);
        for (const e of doomed) this.destroy(e);
      }
    }
  }

  /** Every entity, component and system gone. */
  clear(): void {
    for (const s of this.systems.splice(0)) s.dispose?.();
    this.alive.clear();
    this.stores.clear();
    this.doomed.length = 0;
  }

  private store<T>(type: ComponentType<T>): Map<Entity, unknown> {
    let s = this.stores.get(type.id);
    if (!s) {
      s = new Map();
      this.stores.set(type.id, s);
    }
    return s;
  }
}
