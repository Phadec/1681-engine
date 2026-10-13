import type { ComponentType } from './World';

/**
 * Numeric components stored as columns of typed arrays instead of one object per entity: `Position.x` and
 * `Position.y` are two `Float32Array`s indexed by the entity's slot. A system walking thousands of bodies then reads
 * memory in order and makes no garbage, which is several times faster than objects at scale (see `bench/`).
 *
 * ```ts
 * const Position = defineFields('Position', { x: 'f32', y: 'f32' });
 * world.add(e, Position, { x: 10, y: 20 });
 * const p = world.columns(Position); // fetch per run: columns grow (and are replaced) as entities are added
 * world.each(Position, (e, i) => { p.x[i] += 1; });
 * ```
 *
 * In `each`/`query` a field component's value is the entity's slot index `i`, the index into every column.
 */
export type FieldKind = 'f32' | 'f64' | 'i8' | 'i16' | 'i32' | 'u8' | 'u16' | 'u32';

export type FieldSpec = Record<string, FieldKind>;

export type ArrayOf<K extends FieldKind> = K extends 'f32'
  ? Float32Array
  : K extends 'f64'
    ? Float64Array
    : K extends 'i8'
      ? Int8Array
      : K extends 'i16'
        ? Int16Array
        : K extends 'i32'
          ? Int32Array
          : K extends 'u8'
            ? Uint8Array
            : K extends 'u16'
              ? Uint16Array
              : Uint32Array;

/** One typed array per field, indexed by slot. */
export type Columns<S extends FieldSpec> = { [K in keyof S]: ArrayOf<S[K]> };

/** What `add` takes for a field component: any subset of its fields (the rest start at 0). */
export type FieldValues<S extends FieldSpec> = { [K in keyof S]?: number };

/** A component of numeric fields. Its value in `each`/`query` is the slot index. */
export interface FieldsType<S extends FieldSpec> extends ComponentType<number> {
  readonly fields: S;
}

const CTORS: Record<FieldKind, new (n: number) => ArrayLike<number> & { set(a: ArrayLike<number>): void }> = {
  f32: Float32Array,
  f64: Float64Array,
  i8: Int8Array,
  i16: Int16Array,
  i32: Int32Array,
  u8: Uint8Array,
  u16: Uint16Array,
  u32: Uint32Array,
};

export function isFields(type: ComponentType<unknown>): type is FieldsType<FieldSpec> {
  return (type as { fields?: unknown }).fields !== undefined;
}

/** Fresh columns of at least `n` slots, keeping what `old` held. */
export function growColumns(spec: FieldSpec, n: number, old?: Record<string, ArrayLike<number>>): Record<string, ArrayLike<number>> {
  const out: Record<string, ArrayLike<number>> = {};
  for (const [name, kind] of Object.entries(spec)) {
    const col = new CTORS[kind](n);
    const prev = old?.[name];
    if (prev) col.set(prev);
    out[name] = col;
  }
  return out;
}
