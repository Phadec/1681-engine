import type { ComponentType, Entity, World } from '../ecs/World';

/** One entity as the inspector lists it. */
export interface EntityRow {
  entity: Entity;
  /** `Name` or `Name {…}` per component it holds, of those asked about. */
  components: string[];
}

/**
 * Lists up to `limit` entities with a short preview of each component's value: those holding any of `components`
 * when the game names some (only those shown), else every live entity with all it holds (`World.entities`,
 * `componentsOf`). For the debug overlay: it allocates, and runs a few times a second only while the overlay is open.
 */
export function inspectWorld(world: World, components?: readonly ComponentType<unknown>[], limit = 20, previewLength = 40): EntityRow[] {
  if (!components?.length) {
    return world
      .entities()
      .slice(0, limit)
      .map((e) => ({ entity: e, components: world.componentsOf(e).map((type) => describe(type, world.get(e, type), previewLength)) }));
  }
  const rows = new Map<Entity, EntityRow>();
  for (const type of components) {
    world.each(type, (e, value) => {
      let row = rows.get(e);
      if (!row) {
        if (rows.size >= limit) return;
        row = { entity: e, components: [] };
        rows.set(e, row);
      }
      row.components.push(describe(type, value, previewLength));
    });
  }
  return [...rows.values()].sort((a, b) => a.entity - b.entity);
}

function describe(type: ComponentType<unknown>, value: unknown, max: number): string {
  // a field component's stored value is only its slot: the numbers live in the world's columns
  if ('fields' in type) return type.name;
  let text: string;
  try {
    text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  } catch {
    text = '[unprintable]';
  }
  if (text === undefined) return type.name;
  return `${type.name} ${text.length > max ? text.slice(0, max - 1) + '…' : text}`;
}
