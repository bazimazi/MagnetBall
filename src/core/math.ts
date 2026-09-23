export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function hypot(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function len2(x: number, y: number): number {
  return x * x + y * y;
}

/** Smoothstep falloff: 1 at the source, 0 at range. */
export function falloff(dist: number, range: number): number {
  if (dist <= 0) return 1;
  if (dist >= range) return 0;
  const t = 1 - dist / range;
  return t * t * (3 - 2 * t);
}

export function overlapsRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  return px >= x && py >= y && px <= x + w && py <= y + h;
}

export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dist: number; cx: number; cy: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 1e-10 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return { dist: Math.hypot(px - cx, py - cy), cx, cy, t };
}

/** Slab test. Returns true if the open segment from A to B intersects the rect. */
export function segmentHitsRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - rx, rx + rw - x0, y0 - ry, ry + rh - y0];
  for (let i = 0; i < 4; i++) {
    const pi = p[i] ?? 0;
    const qi = q[i] ?? 0;
    if (Math.abs(pi) < 1e-10) {
      if (qi < 0) return false;
    } else {
      const t = qi / pi;
      if (pi < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}
