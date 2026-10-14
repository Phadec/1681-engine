import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Image } from '../core/Image.ts';
import { World } from '../ecs/World.ts';
import { AnimationComponent, animationSystem, SpriteComponent } from './animationSystem.ts';
import { AnimStateComponent, animStateSystem } from './animStateSystem.ts';
import { Animator } from './Animator.ts';
import { AnimStateMachine } from './AnimStateMachine.ts';

/** A stand-in for an `Image`: the frame it shows, and how often it was told to change. */
function fakeSprite(frame = '') {
  const s = { frameName: frame, sets: 0, setFrame(f: string | number) {
    s.frameName = String(f);
    s.sets++;
    return s;
  } };
  return s;
}

const run = (world: World, dt: number) => world.run('frame', { dt, now: 0, alpha: 0 });

test('the animation system steps each animator and shows its frame, only when it changes', () => {
  const world = new World();
  world.addSystem(animationSystem());
  const sprite = fakeSprite();
  const e = world.create();
  world.add(e, SpriteComponent, sprite as unknown as Image);
  world.add(e, AnimationComponent, new Animator({ walk: { frames: ['a', 'b', 'c'], fps: 10 } }, 'walk'));
  run(world, 0.01);
  assert.equal(sprite.frameName, 'a', 'the first frame is shown at once');
  assert.equal(sprite.sets, 1);
  run(world, 0.01);
  assert.equal(sprite.sets, 1, 'no change, no texture swap');
  run(world, 0.1);
  assert.equal(sprite.frameName, 'b');
  // an entity with only one of the two is left alone
  const lone = fakeSprite('x');
  world.add(world.create(), SpriteComponent, lone as unknown as Image);
  run(world, 0.1);
  assert.equal(lone.sets, 0);
});

test('the state system updates each machine, shows its frame, and leaves a still one alone', () => {
  const world = new World();
  world.addSystem(animStateSystem());
  const sm = new AnimStateMachine(
    { idle: { frames: [0, 1], durations: [100, 100] }, run: { frames: [5, 6], durations: [100, 100] } },
    {
      initial: 'idle',
      params: { speed: 0 },
      states: { idle: { clip: 'idle' }, run: { clip: 'run' } },
      transitions: [{ from: 'idle', to: 'run', when: { speed: ['>', 0] } }],
    },
  );
  const sprite = fakeSprite();
  const e = world.create();
  world.add(e, SpriteComponent, sprite as unknown as Image);
  world.add(e, AnimStateComponent, sm);
  run(world, 0.05);
  assert.equal(sprite.frameName, '0');
  const sets = sprite.sets;
  run(world, 0.01);
  assert.equal(sprite.sets, sets);
  sm.set('speed', 3);
  run(world, 0.01);
  assert.equal(sprite.frameName, '5');
});
