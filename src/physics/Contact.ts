import type { Body } from './Body';
import type { ContactInfo, Vec2 } from './types';

/** One point of a contact and the solver's terms for it. */
export class ContactPoint {
  /** World position when measured, and the depth there (px, < 0 a gap). */
  x = 0;
  y = 0;
  depth = 0;
  /** Which corners or faces made it: matched from step to step to carry the impulses over. */
  id = 0;
  /** Accumulated normal and friction impulses. */
  jn = 0;
  jt = 0;
  /** Per sub-step solver terms. */
  massN = 0;
  massT = 0;
  target = 0;
  /** Offsets from each body's centre, refreshed every sub-step. */
  rax = 0;
  ray = 0;
  rbx = 0;
  rby = 0;
  /** The point in each body's own frame when measured, so position correction can track its depth as they move and turn. */
  lax = 0;
  lay = 0;
  lbx = 0;
  lby = 0;
}

/**
 * One touching pair, kept from step to step while they touch: the impulses it ended the last step with start the
 * next one (warm starting), which is what lets a stack settle in a few solver iterations instead of shivering.
 */
export class Contact implements ContactInfo {
  nx = 0;
  ny = 1;
  depth = 0;
  /** One or two points; only the first `count` are in use. */
  readonly pts: [ContactPoint, ContactPoint] = [new ContactPoint(), new ContactPoint()];
  count = 0;
  mu = 0;
  /** Solved this sub-step (false when the pre-solve hook turned it off). */
  enabled = true;
  /** The world step and sub-step that last found it. */
  seenStep = -1;
  seenSub = -1;
  /** Reported as touching (a `begin` went out and no `end` yet). */
  reported = false;

  constructor(
    readonly a: Body,
    readonly b: Body,
    readonly key: number,
  ) {}

  get sensor(): boolean {
    return this.a.sensor || this.b.sensor;
  }

  /** Where the two touch, world px. */
  get points(): Vec2[] {
    const out: Vec2[] = [];
    for (let i = 0; i < this.count; i++) out.push({ x: this.pts[i]!.x, y: this.pts[i]!.y });
    return out;
  }

  /** Accumulated normal impulse over the points: how hard the pair pressed together on the last sub-step. */
  get normalImpulse(): number {
    let j = 0;
    for (let i = 0; i < this.count; i++) j += this.pts[i]!.jn;
    return j;
  }

  /** The other body of the pair. */
  other(body: Body): Body {
    return body === this.a ? this.b : this.a;
  }

  /** A stable number for the pair, whichever order it is asked in. */
  static keyOf(a: Body, b: Body): number {
    const lo = a.id < b.id ? a.id : b.id;
    const hi = a.id < b.id ? b.id : a.id;
    return lo * 0x4000000 + hi;
  }
}
