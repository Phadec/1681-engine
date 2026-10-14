/*
 * Aim and lock marks as whole world pixels, pure so they are tested and so `PixelMarks` can build each shape once
 * and only move it: a circle's outline (midpoint circle, every pixel once), a filled disc as one run per row, a
 * ground ellipse, and the chevron an aim line is drawn with.
 */

export type PixelPoint = readonly [number, number];
/** One horizontal run of pixels: row y, from x0 to x1 inclusive. */
export type PixelRun = readonly [number, number, number];

/** The outline of a circle of radius `r` round (0, 0), each pixel once (midpoint algorithm, 8-way symmetric). */
export function ringPixels(r: number): PixelPoint[] {
  r = Math.max(1, Math.round(r));
  const seen = new Set<string>();
  const out: PixelPoint[] = [];
  const put = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push([x, y]);
  };
  let x = r;
  let y = 0;
  let err = 1 - r;
  while (x >= y) {
    for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]] as const) put(a, b);
    y++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
  return out;
}

/** A filled disc of radius `r` round (0, 0), one run per row. */
export function discRuns(r: number): PixelRun[] {
  r = Math.max(1, Math.round(r));
  const out: PixelRun[] = [];
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y) + 0.5);
    out.push([y, -half, half]);
  }
  return out;
}


/**
 * The outline of an ellipse `rx` wide and `ry` deep round (0, 0), each pixel once (midpoint algorithm) — a circle on
 * the ground as a three-quarter view shows it, so a body can stand in the middle of it.
 */
export function ellipsePixels(rx: number, ry: number): PixelPoint[] {
  rx = Math.max(1, Math.round(rx));
  ry = Math.max(1, Math.round(ry));
  const seen = new Set<string>();
  const out: PixelPoint[] = [];
  const put4 = (x: number, y: number) => {
    for (const [a, b] of [[x, y], [-x, y], [x, -y], [-x, -y]] as const) {
      const k = `${a},${b}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([a, b]);
    }
  };
  const a2 = rx * rx;
  const b2 = ry * ry;
  let x = 0;
  let y = ry;
  // region 1: the flat top and bottom, stepping x
  let d1 = b2 - a2 * ry + 0.25 * a2;
  let dx = 2 * b2 * x;
  let dy = 2 * a2 * y;
  while (dx < dy) {
    put4(x, y);
    x++;
    dx += 2 * b2;
    if (d1 < 0) d1 += dx + b2;
    else {
      y--;
      dy -= 2 * a2;
      d1 += dx - dy + b2;
    }
  }
  // region 2: the steep sides, stepping y
  let d2 = b2 * (x + 0.5) * (x + 0.5) + a2 * (y - 1) * (y - 1) - a2 * b2;
  while (y >= 0) {
    put4(x, y);
    y--;
    dy -= 2 * a2;
    if (d2 > 0) d2 += a2 - dy;
    else {
      x++;
      dx += 2 * b2;
      d2 += dx - dy + a2;
    }
  }
  return out;
}

/**
 * A chevron (›) pointing along `angle`, its arms `size` px out from the line either side, round (0, 0): the bright
 * stroke and the dark pixels that rim it. A row of these, evenly spaced, is how an aim line is drawn: each one is
 * crisp at any angle, and with no continuous edge between them there is no staircase to see — a solid line of world
 * pixels at, say, 20° is one, and read as broken.
 */
export function chevronPixels(angle: number, size: number): { lit: PixelPoint[]; rim: PixelPoint[] } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tip = { u: size * 0.5, v: 0 };
  const arms = [
    { u: -size * 0.5, v: -size },
    { u: -size * 0.5, v: size },
  ];
  const r = size + 2;
  const on = new Set<string>();
  const lit: PixelPoint[] = [];
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const u = x * cos + y * sin;
      const v = -x * sin + y * cos;
      if (Math.min(...arms.map((a) => segDist(u, v, a.u, a.v, tip.u, tip.v))) <= 0.72) {
        on.add(`${x},${y}`);
        lit.push([x, y]);
      }
    }
  const rim: PixelPoint[] = [];
  const seen = new Set<string>();
  for (const [x, y] of lit)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${x + dx},${y + dy}`;
        if (on.has(k) || seen.has(k)) continue;
        seen.add(k);
        rim.push([x + dx, y + dy]);
      }
  return { lit, rim };
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
