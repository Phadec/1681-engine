import type { Image } from '../core/Image';
import { defineComponent, system, type System } from '../ecs/World';
import type { Animator } from './Animator';

/** The engine's sprite component: the `Image` an entity is drawn as. */
export const SpriteComponent = defineComponent<Image>('Sprite');

/** The engine's animation component: the `Animator` choosing the sprite's frame. */
export const AnimationComponent = defineComponent<Animator>('Animation');

/**
 * Advances every `Animator` each frame and shows its frame on the entity's sprite (only when it changed, so an idle
 * crowd costs no texture swaps).
 */
export function animationSystem(name = 'animation'): System {
  return system(name, 'frame', ({ world, dt }) => {
    world.each(SpriteComponent, AnimationComponent, (_e, sprite, anim) => {
      const changed = anim.update(dt);
      if (changed || sprite.frameName !== String(anim.frame)) sprite.setFrame(anim.frame);
    });
  });
}
