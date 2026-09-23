import { clamp, distToSegment, falloff, segmentHitsRect } from "../core/math";
import type { LevelDef, Polarity, ShieldDef, SimState } from "../core/types";
import { faceFrame, poseOf, cycledPolarity } from "./geom";

export interface ForceHit {
  id: string;
  ax: number;
  ay: number;
  x: number;
  y: number;
  attract: boolean;
  mag: number;
}

function blocked(
  shields: ShieldDef[] | undefined,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  if (!shields) return false;
  for (const s of shields) {
    if (segmentHitsRect(x0, y0, x1, y1, s.x, s.y, s.w, s.h)) return true;
  }
  return false;
}

function push(
  out: ForceHit[],
  id: string,
  ax: number,
  ay: number,
  x: number,
  y: number,
  attract: boolean,
): void {
  const mag = Math.hypot(ax, ay);
  if (mag < 0.05) return;
  out.push({ id, ax, ay, x, y, attract, mag });
}

/**
 * Magnetic acceleration on the ball. Opposite poles attract, like poles repel.
 * Falloff is measured from the ball's surface to the magnet's surface so
 * contact is the strongest, most readable moment. Shields occlude the ray
 * from the ball to the sample point.
 */
export function magneticForces(
  level: LevelDef,
  state: SimState,
  time: number,
  effective: Polarity,
  magnetScale: number,
): ForceHit[] {
  const out: ForceHit[] = [];
  if (effective === 0) return out;
  const b = state.ball;
  const scale = (magnetScale * b.susceptibility) / b.mass;
  const shields = level.shields;

  for (const plate of level.plates ?? []) {
    const pose = poseOf(plate.x, plate.y, plate.motion, time);
    const pol = cycledPolarity(plate.polarity, plate.cycle, time);
    const face = faceFrame(plate.face, pose.x, pose.y, plate.w, plate.h);
    const hit = plateForce(
      b.x,
      b.y,
      b.radius,
      face,
      plate.range,
      plate.strength * scale,
      effective,
      pol,
    );
    if (!hit) continue;
    if (blocked(shields, b.x, b.y, hit.x, hit.y)) continue;
    push(out, plate.id, hit.ax, hit.ay, hit.x, hit.y, hit.attract);
  }

  for (const orb of level.orbs ?? []) {
    const pose = poseOf(orb.x, orb.y, orb.motion, time);
    const pol = cycledPolarity(orb.polarity, orb.cycle, time);
    const housing = orb.r ?? 0.48;
    const dx = pose.x - b.x;
    const dy = pose.y - b.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const gap = Math.max(0, dist - housing - b.radius);
    if (gap > orb.range) continue;
    if (blocked(shields, b.x, b.y, pose.x, pose.y)) continue;
    const f = falloff(gap, orb.range) * orb.strength * scale;
    const attract = effective * pol < 0;
    const dir = attract ? 1 : -1;
    push(out, orb.id, (dx / dist) * f * dir, (dy / dist) * f * dir, pose.x, pose.y, attract);
  }

  for (const ring of level.rings ?? []) {
    const pose = poseOf(ring.x, ring.y, ring.motion, time);
    const pol = cycledPolarity(ring.polarity, ring.cycle, time);
    const dx = b.x - pose.x;
    const dy = b.y - pose.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const radial = dist - ring.radius;
    const gap = Math.max(0, Math.abs(radial) - b.radius);
    if (gap > ring.range) continue;
    const sampleX = pose.x + (dx / dist) * ring.radius;
    const sampleY = pose.y + (dy / dist) * ring.radius;
    if (blocked(shields, b.x, b.y, sampleX, sampleY)) continue;
    const f = falloff(gap, ring.range) * ring.strength * scale;
    const attract = effective * pol < 0;
    // Attract pulls toward the ring; repel pushes off it.
    const toward = radial > 0 ? -1 : 1;
    const sign = attract ? toward : -toward;
    push(
      out,
      ring.id,
      (dx / dist) * f * sign,
      (dy / dist) * f * sign,
      sampleX,
      sampleY,
      attract,
    );
  }

  for (const rail of level.rails ?? []) {
    const pol = cycledPolarity(rail.polarity, rail.cycle, time);
    const a = poseOf(rail.x1, rail.y1, rail.motion, time);
    const bPose = poseOf(rail.x2, rail.y2, rail.motion, time);
    const seg = distToSegment(b.x, b.y, a.x, a.y, bPose.x, bPose.y);
    const gap = Math.max(0, seg.dist - b.radius);
    const capture = rail.capture ?? 0.7;
    const attract = effective * pol < 0;
    if (attract && gap < capture && seg.t > 0.02 && seg.t < 0.98) {
      // Constraint is applied later. A light pull helps the approach read.
      continue;
    }
    if (gap > rail.range || seg.dist < 1e-6) continue;
    if (blocked(shields, b.x, b.y, seg.cx, seg.cy)) continue;
    const f = falloff(gap, rail.range) * rail.strength * scale;
    if (attract) {
      const ix = (seg.cx - b.x) / seg.dist;
      const iy = (seg.cy - b.y) / seg.dist;
      push(out, rail.id, ix * f, iy * f, seg.cx, seg.cy, true);
    } else {
      const el = Math.hypot(rail.exitX, rail.exitY) || 1;
      push(out, rail.id, (rail.exitX / el) * f, (rail.exitY / el) * f, seg.cx, seg.cy, false);
    }
  }

  return out;
}

function plateForce(
  bx: number,
  by: number,
  radius: number,
  face: { ax: number; ay: number; bx: number; by: number; nx: number; ny: number },
  range: number,
  strength: number,
  ballPol: Polarity,
  platePol: -1 | 1,
): { ax: number; ay: number; x: number; y: number; attract: boolean } | null {
  const abx = face.bx - face.ax;
  const aby = face.by - face.ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 1e-10 ? ((bx - face.ax) * abx + (by - face.ay) * aby) / len2 : 0;
  const on = t >= 0 && t <= 1;
  t = clamp(t, 0, 1);
  const cx = face.ax + abx * t;
  const cy = face.ay + aby * t;
  const dx = bx - cx;
  const dy = by - cy;
  const side = dx * face.nx + dy * face.ny;
  // Behind the housing the field does not leak.
  if (side < -0.04) return null;
  const dist = Math.hypot(dx, dy);
  const gap = Math.max(0, dist - radius);
  if (gap > range || dist < 1e-8) return null;
  const f = falloff(gap, range) * strength;
  const attract = ballPol * platePol < 0;
  let ix: number;
  let iy: number;
  if (on) {
    ix = -face.nx;
    iy = -face.ny;
  } else {
    ix = -dx / dist;
    iy = -dy / dist;
  }
  const sign = attract ? 1 : -1;
  return { ax: ix * f * sign, ay: iy * f * sign, x: cx, y: cy, attract };
}

export function effectivePolarity(level: LevelDef, x: number, y: number, polarity: -1 | 1): Polarity {
  let p: Polarity = polarity;
  for (const z of level.zones ?? []) {
    if (x < z.x || y < z.y || x > z.x + z.w || y > z.y + z.h) continue;
    if (z.kind === "invert") p = p === 0 ? 0 : p === 1 ? -1 : 1;
    else if (z.kind === "lock" && (z.polarity === 1 || z.polarity === -1)) p = z.polarity;
  }
  return p;
}
