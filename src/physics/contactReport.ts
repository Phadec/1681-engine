import type { Body } from './Body';
import type { Contact } from './Contact';
import type { ContactInfo } from './types';

/** Marks `body` as standing on `ground` through contact `c`; the first ground found in a step wins. */
export function setGround(body: Body, ground: Body, c: Contact): void {
  if (body.grounded) return;
  body.grounded = true;
  body.ground = ground;
  const s = body === c.b ? 1 : -1;
  body.groundNx = c.nx * s;
  body.groundNy = c.ny * s;
}

/** A copy for an event: the contact itself changes on the next step. */
export function info(c: Contact): ContactInfo {
  return { a: c.a, b: c.b, nx: c.nx, ny: c.ny, depth: c.depth, sensor: c.sensor };
}
