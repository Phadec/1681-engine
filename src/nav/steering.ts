/*
 * Steering: the small forces that make a crowd move like one — towards a target, slowing on arrival, keeping apart,
 * flowing along a field. Each returns a desired change of velocity (px/s) for one body; `combineSteering` weighs and
 * caps them, and the game adds the result to the body's velocity (or feeds it to its physics body as a force).
 * Pure and allocation-light: one small object out per call, nothing kept.
 */

export interface SteerVec {
  x: number;
  y: number;
}

/** A body as steering sees it. */
export interface SteerAgent {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const ZERO = (): SteerVec => ({ x: 0, y: 0 });

function toward(dx: number, dy: number, speed: number, agent: SteerAgent): SteerVec {
  const d = Math.hypot(dx, dy);
  if (d === 0) return { x: -agent.vx, y: -agent.vy };
  return { x: (dx / d) * speed - agent.vx, y: (dy / d) * speed - agent.vy };
}

/** Full speed straight at a point. */
export function seek(agent: SteerAgent, tx: number, ty: number, maxSpeed: number): SteerVec {
  return toward(tx - agent.x, ty - agent.y, maxSpeed, agent);
}

/** Full speed straight away from a point, within `panic` px of it (default always). */
export function flee(agent: SteerAgent, tx: number, ty: number, maxSpeed: number, panic = Infinity): SteerVec {
  const dx = agent.x - tx;
  const dy = agent.y - ty;
  if (dx * dx + dy * dy > panic * panic) return ZERO();
  return toward(dx, dy, maxSpeed, agent);
}

/** Like `seek`, but slowing inside `slowRadius` px so it stops on the point instead of overshooting. */
export function arrive(agent: SteerAgent, tx: number, ty: number, maxSpeed: number, slowRadius: number): SteerVec {
  const dx = tx - agent.x;
  const dy = ty - agent.y;
  const d = Math.hypot(dx, dy);
  const speed = d < slowRadius ? maxSpeed * (d / slowRadius) : maxSpeed;
  return toward(dx, dy, speed, agent);
}

/**
 * Away from neighbours closer than `radius` px, harder the closer they are: bodies of a crowd stop stacking on one
 * tile. A neighbour exactly on top is pushed off along a direction picked from the pair's places, so two bodies
 * spawned on one spot still part.
 */
export function separation(agent: SteerAgent, neighbours: Iterable<SteerAgent>, radius: number, strength: number): SteerVec {
  let x = 0;
  let y = 0;
  for (const o of neighbours) {
    if (o === agent) continue;
    let dx = agent.x - o.x;
    let dy = agent.y - o.y;
    let d = Math.hypot(dx, dy);
    if (d >= radius) continue;
    if (d === 0) {
      // the same spot: a fixed direction from the pair's speeds, else straight right
      dx = agent.vx - o.vx || 1;
      dy = agent.vy - o.vy;
      d = Math.hypot(dx, dy);
      dx /= d;
      dy /= d;
      d = 0;
    } else {
      dx /= d;
      dy /= d;
    }
    const push = (1 - d / radius) * strength;
    x += dx * push;
    y += dy * push;
  }
  return { x, y };
}

/** Towards the average heading of neighbours within `radius` (a flock turning together). */
export function alignment(agent: SteerAgent, neighbours: Iterable<SteerAgent>, radius: number): SteerVec {
  let vx = 0;
  let vy = 0;
  let n = 0;
  for (const o of neighbours) {
    if (o === agent || (o.x - agent.x) ** 2 + (o.y - agent.y) ** 2 > radius * radius) continue;
    vx += o.vx;
    vy += o.vy;
    n++;
  }
  return n === 0 ? ZERO() : { x: vx / n - agent.vx, y: vy / n - agent.vy };
}

/** Towards the middle of neighbours within `radius` (a flock keeping together). */
export function cohesion(agent: SteerAgent, neighbours: Iterable<SteerAgent>, radius: number, maxSpeed: number): SteerVec {
  let cx = 0;
  let cy = 0;
  let n = 0;
  for (const o of neighbours) {
    if (o === agent || (o.x - agent.x) ** 2 + (o.y - agent.y) ** 2 > radius * radius) continue;
    cx += o.x;
    cy += o.y;
    n++;
  }
  return n === 0 ? ZERO() : seek(agent, cx / n, cy / n, maxSpeed);
}

/** What `followFlow` reads: a flow field (`flowField.ts`). */
export interface StepSource {
  stepAt(tx: number, ty: number): readonly [number, number] | null;
  costAt(tx: number, ty: number): number;
}

/**
 * Full speed along a flow field from the tile the body stands on. On a goal it brakes to a stop, so a crowd gathers
 * there rather than coasting past. Pushed off the field (into a wall, off the grid, by a crowd's shoving), it heads
 * for the cheapest tile around it that is on the field, so it is never stranded; with none within two tiles, it
 * brakes.
 */
export function followFlow(agent: SteerAgent, field: StepSource, tileSize: number, maxSpeed: number): SteerVec {
  const tx = Math.floor(agent.x / tileSize);
  const ty = Math.floor(agent.y / tileSize);
  const s = field.stepAt(tx, ty);
  if (s) return toward(s[0], s[1], maxSpeed, agent);
  if (field.costAt(tx, ty) === 0) return { x: -agent.vx, y: -agent.vy };
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (let r = 1; r <= 2 && best === Infinity; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const c = field.costAt(tx + dx, ty + dy);
        if (c < best) {
          best = c;
          bx = dx;
          by = dy;
        }
      }
  if (best === Infinity) return { x: -agent.vx, y: -agent.vy };
  // to the middle of that tile, from where the body stands
  return seek(agent, (tx + bx + 0.5) * tileSize, (ty + by + 0.5) * tileSize, maxSpeed);
}

/** Weighs steering forces, sums them and caps the sum at `maxForce` (px/s of change a step). */
export function combineSteering(maxForce: number, ...weighted: [SteerVec, number][]): SteerVec {
  let x = 0;
  let y = 0;
  for (const [v, w] of weighted) {
    x += v.x * w;
    y += v.y * w;
  }
  const m = Math.hypot(x, y);
  if (m > maxForce) {
    x = (x / m) * maxForce;
    y = (y / m) * maxForce;
  }
  return { x, y };
}

/**
 * One step of steering applied to a body: velocity changed by `force × dt`, capped at `maxSpeed`, position moved.
 * For bodies with no physics of their own (birds, a crowd of extras); a physics body takes the force instead.
 */
export function applySteering(agent: SteerAgent, force: SteerVec, maxSpeed: number, dt: number): void {
  agent.vx += force.x * dt;
  agent.vy += force.y * dt;
  const s = Math.hypot(agent.vx, agent.vy);
  if (s > maxSpeed) {
    agent.vx = (agent.vx / s) * maxSpeed;
    agent.vy = (agent.vy / s) * maxSpeed;
  }
  agent.x += agent.vx * dt;
  agent.y += agent.vy * dt;
}
