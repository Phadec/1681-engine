import type { TweenTarget } from './Tweener';

/**
 * How a tween reads and writes one property, shared by `Tweener` and `Timeline` so both treat `scale` the same way:
 * one number written to `scaleX` and `scaleY`, the shape every display object here exposes.
 */
export function readProp(target: TweenTarget, prop: string): number {
  const v = prop === 'scale' ? target['scaleX'] : target[prop];
  return typeof v === 'number' ? v : 0;
}

export function writeProp(target: TweenTarget, prop: string, value: number): void {
  if (prop === 'scale') {
    target['scaleX'] = value;
    target['scaleY'] = value;
  } else target[prop] = value;
}
