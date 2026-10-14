import { defineComponent, system, type ComponentType, type System } from '../ecs/World';
import { SpriteComponent } from './animationSystem';
import type { AnimStateMachine } from './AnimStateMachine';

/** An entity's animation state machine. Give an entity this instead of `AnimationComponent`: the machine owns its animator. */
export const AnimStateComponent: ComponentType<AnimStateMachine> = defineComponent<AnimStateMachine>('AnimState');

/**
 * Updates every `AnimStateMachine` each frame and shows its frame on the entity's sprite (only when it changed).
 * Add it after the systems that set the machines' parameters, so a change shows the same frame.
 */
export function animStateSystem(name = 'anim-state'): System {
  return system(name, 'frame', ({ world, dt }) => {
    world.each(SpriteComponent, AnimStateComponent, (_e, sprite, sm) => {
      sm.update(dt);
      const frame = sm.frame;
      if (sprite.frameName !== String(frame)) sprite.setFrame(frame);
    });
  });
}
