import { system, type System } from '../ecs/World';
import type { PhysicsWorld } from './PhysicsWorld';

/** A `fixed` system that steps `physics` once per simulation step, by the loop's own dt. */
export function physicsSystem(physics: PhysicsWorld, name = 'physics'): System {
  return system(name, 'fixed', ({ dt }) => physics.step(dt));
}
