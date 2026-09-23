import type { BallState, SimEvent } from "../core/types";
import { clamp } from "../core/math";

const REST_IMPACT = 2.15;

function resolve(
  b: BallState,
  nx: number,
  ny: number,
  restitution: number,
  events: SimEvent[],
): void {
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= -1e-4) return;
  const tx = -ny;
  const ty = nx;
  const vt = b.vx * tx + b.vy * ty;
  const impact = -vn;
  const er = impact < REST_IMPACT ? 0 : restitution;
  // Continuous slide friction. A per-frame multiply would glue the ball down.
  const drop = b.friction * 20 * (1 / 120) * (impact < REST_IMPACT ? 1 : 0.35);
  let vt2 = vt;
  if (Math.abs(vt) <= drop) vt2 = 0;
  else vt2 = vt - Math.sign(vt) * drop;
  b.vx = -impact * er * nx + vt2 * tx;
  b.vy = -impact * er * ny + vt2 * ty;
  b.onGround = b.onGround || ny < -0.6;
  b.contactNX = nx;
  b.contactNY = ny;
  if (impact > 1.45) {
    events.push({ type: "bounce", speed: impact, x: b.x, y: b.y, nx, ny });
  }
}

export function collideBox(
  b: BallState,
  x: number,
  y: number,
  w: number,
  h: number,
  restitution: number,
  events: SimEvent[],
): void {
  const r = b.radius;
  const minX = x;
  const maxX = x + w;
  const minY = y;
  const maxY = y + h;
  const inside = b.x > minX && b.x < maxX && b.y > minY && b.y < maxY;
  if (inside) {
    const left = b.x - minX;
    const right = maxX - b.x;
    const top = b.y - minY;
    const bottom = maxY - b.y;
    const min = Math.min(left, right, top, bottom);
    let nx = 0;
    let ny = 0;
    if (min === left) {
      b.x = minX - r;
      nx = -1;
    } else if (min === right) {
      b.x = maxX + r;
      nx = 1;
    } else if (min === top) {
      b.y = minY - r;
      ny = -1;
    } else {
      b.y = maxY + r;
      ny = 1;
    }
    resolve(b, nx, ny, restitution, events);
    return;
  }
  const cx = clamp(b.x, minX, maxX);
  const cy = clamp(b.y, minY, maxY);
  const dx = b.x - cx;
  const dy = b.y - cy;
  const dist2 = dx * dx + dy * dy;
  if (dist2 >= r * r || dist2 < 1e-12) return;
  const dist = Math.sqrt(dist2);
  const nx = dx / dist;
  const ny = dy / dist;
  const pen = r - dist;
  b.x += nx * pen;
  b.y += ny * pen;
  resolve(b, nx, ny, restitution, events);
}

export function collideCircle(
  b: BallState,
  cx: number,
  cy: number,
  radius: number,
  restitution: number,
  events: SimEvent[],
): void {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const minDist = b.radius + radius;
  const dist2 = dx * dx + dy * dy;
  if (dist2 >= minDist * minDist) return;
  const dist = Math.sqrt(dist2) || 1e-6;
  const nx = dx / dist;
  const ny = dy / dist;
  b.x = cx + nx * minDist;
  b.y = cy + ny * minDist;
  resolve(b, nx, ny, restitution, events);
}

/** One-sided ledge. `y` is the surface; the ball lands when falling onto it. */
export function collidePlatform(
  b: BallState,
  x: number,
  y: number,
  w: number,
  restitution: number,
  events: SimEvent[],
): void {
  if (b.x < x || b.x > x + w) return;
  const bottom = b.y + b.radius;
  const prevBottom = b.prevY + b.radius;
  if (b.vy < 0) return;
  if (prevBottom > y + 0.3) return;
  if (bottom < y) return;
  b.y = y - b.radius;
  resolve(b, 0, -1, restitution, events);
}
