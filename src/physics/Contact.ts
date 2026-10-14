import type { Body } from './Body';
import type { ContactInfo } from './types';

/**
 * One touching pair, kept from step to step while they touch: the impulses it ended the last step with start the
 * next one (warm starting), which is what lets a stack settle in a few solver iterations instead of shivering.
 */
export class Contact implements ContactInfo {
  nx = 0;
  ny = 1;
  depth = 0;
  /** Accumulated normal and friction impulses. */
  jn = 0;
  jt = 0;
  /** Per sub-step solver terms. */
  massN = 0;
  target = 0;
  mu = 0;
  /** Bodies' positions when the depth was measured, so position correction can track the depth as they move. */
  ax0 = 0;
  ay0 = 0;
  bx0 = 0;
  by0 = 0;
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
