/**
 * The drag-to-aim gesture of a touch skill button (the MOBA way), kept pure so it can be tested. Pressing an aimed
 * button opens a circle round it with a knob under the thumb; where the knob sits in that circle is where the skill
 * goes. A press that never wanders past the tap slop is a tap (the game casts it the way a tap always does: at the
 * locked target, the nearest enemy, the facing). Letting go over a cancel zone casts nothing; letting go with the knob
 * back on the button casts as a tap, or cancels when `centreCancels` (the one way to cancel when there is no zone).
 *
 * The thumb gets a longer slop in the first `pressMs` of a press: a hard press slides as it lands, and a quick tap
 * that slid past the plain slop became a drag that flew wherever the slide pointed.
 *
 * ```ts
 * const g = new AimGesture({ radius: 90, centreCancels: !hasCancelZone });
 * // pointermove:  g.move(dx, dy, overCancelZone, now - downAt)
 * // pointerup:    const end = g.up(); // 'tap' | 'cast' | 'cancel'
 * // while g.aiming, draw the aim from aimPoint(caster, shape, g.share, facing)
 * ```
 */

export type AimEnd = 'tap' | 'cast' | 'cancel';

export interface AimGestureOptions {
  /** The circle's radius, in the same units as the thumb's offsets (CSS px). */
  radius: number;
  /** Scales the thumb's travel into the knob's (a sensitivity setting); the slops stay the thumb's own (default 1). */
  sensitivity?: number;
  /** The knob let go back on the button cancels rather than casting as a tap (default true). */
  centreCancels?: boolean;
  /** How far the thumb may wander before a press is a drag (default 10). */
  tapSlop?: number;
  /** The slop in a press's first `pressMs` (default 28). */
  earlySlop?: number;
  /** How long a press is "landing" (default 180 ms). */
  pressMs?: number;
  /** Inside this share of the radius the knob is back on the button (default 0.2). */
  centre?: number;
}

export const AIM_TAP_SLOP = 10;
export const AIM_EARLY_SLOP = 28;
export const AIM_PRESS_MS = 180;
export const AIM_CENTRE = 0.2;

/**
 * How far the thumb must wander, `ms` into a press, before it drags. `early` false keeps the plain slop throughout
 * (an attack button with nothing locked: there a slide is as good as a drag).
 */
export function dragSlop(ms: number, early = true, tapSlop = AIM_TAP_SLOP, earlySlop = AIM_EARLY_SLOP, pressMs = AIM_PRESS_MS): number {
  return early && ms < pressMs ? earlySlop : tapSlop;
}

type Point = { x: number; y: number };

export class AimGesture {
  private dragged = false;
  private over = false;
  /** Where the knob is drawn, clamped to the circle, relative to the button's centre. */
  knob: Point = { x: 0, y: 0 };
  /** The knob as a vector of length ≤ 1: what the world reads. */
  share: Point = { x: 0, y: 0 };
  private readonly radius: number;
  private readonly sensitivity: number;
  private readonly centreCancels: boolean;
  private readonly tapSlop: number;
  private readonly earlySlop: number;
  private readonly pressMs: number;
  private readonly centre: number;

  constructor(options: AimGestureOptions) {
    this.radius = Math.max(1e-6, options.radius);
    this.sensitivity = options.sensitivity ?? 1;
    this.centreCancels = options.centreCancels ?? true;
    this.tapSlop = options.tapSlop ?? AIM_TAP_SLOP;
    this.earlySlop = options.earlySlop ?? AIM_EARLY_SLOP;
    this.pressMs = options.pressMs ?? AIM_PRESS_MS;
    this.centre = options.centre ?? AIM_CENTRE;
  }

  /**
   * The thumb at `rawX, rawY` from the button's centre, `overCancel` when it is over the cancel zone, `ms` since it
   * went down (Infinity skips the landing slop). Once a drag, always a drag for this press.
   */
  move(rawX: number, rawY: number, overCancel = false, ms = Infinity): void {
    if (Math.hypot(rawX, rawY) > dragSlop(ms, true, this.tapSlop, this.earlySlop, this.pressMs)) this.dragged = true;
    this.over = overCancel;
    const dx = rawX * this.sensitivity;
    const dy = rawY * this.sensitivity;
    const len = Math.hypot(dx, dy);
    const k = len > this.radius ? this.radius / len : 1;
    this.knob = { x: dx * k, y: dy * k };
    this.share = { x: this.knob.x / this.radius, y: this.knob.y / this.radius };
  }

  /** A drag has begun: show the aim from now on. */
  get aiming(): boolean {
    return this.dragged;
  }

  private get centred(): boolean {
    return Math.hypot(this.share.x, this.share.y) < this.centre;
  }

  /** Letting go now would cast nothing (draw the cancel zone lit). */
  get cancelling(): boolean {
    return this.dragged && (this.over || (this.centreCancels && this.centred));
  }

  up(): AimEnd {
    if (!this.dragged) return 'tap';
    if (this.cancelling) return 'cancel';
    return this.centred ? 'tap' : 'cast';
  }
}

/**
 * How a skill is aimed: at a spot within `range` (a blast, a blink), or along a direction for `length` (a shot, a
 * dash; `backwards` for a leap away from the aim).
 */
export type AimShape =
  | { kind: 'point'; range: number }
  | { kind: 'direction'; length: number; backwards?: boolean; snap?: number };

/**
 * How far out a spot skill's knob puts it, as a share of its range: from the centre ring's edge to the rim is the
 * whole reach, so a knob just out of the ring lands at the caster's feet — with `share × range`, nothing nearer than
 * the ring could ever be reached.
 */
export function spotReach(len: number, centre = AIM_CENTRE): number {
  return Math.max(0, Math.min(1, (len - centre) / (1 - centre)));
}

/** The knob that puts a spot skill `dx, dy` from the caster: `spotReach`'s inverse (aim assist, replays). */
export function spotShare(dx: number, dy: number, range: number, centre = AIM_CENTRE): Point {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const len = centre + (1 - centre) * Math.min(1, d / range);
  return { x: (dx / d) * len, y: (dy / d) * len };
}

/**
 * Where an aimed skill goes, as a mouse would have said it: the aim angle and the ground point. A knob with no length
 * keeps `lastAim`. A direction may snap to `snap` radians (0 or none for free aim).
 */
export function aimPoint(from: Point, shape: AimShape, share: Point, lastAim: number, centre = AIM_CENTRE): { aim: number; x: number; y: number } {
  const len = Math.hypot(share.x, share.y);
  const angle = len > 1e-6 ? Math.atan2(share.y, share.x) : lastAim;
  if (shape.kind === 'point') {
    const d = spotReach(len, centre) * shape.range;
    return { aim: angle, x: from.x + Math.cos(angle) * d, y: from.y + Math.sin(angle) * d };
  }
  const snapped = shape.snap ? Math.round(angle / shape.snap) * shape.snap : angle;
  const aim = shape.backwards ? snapped + Math.PI : snapped;
  return { aim, x: from.x + Math.cos(aim) * shape.length, y: from.y + Math.sin(aim) * shape.length };
}
