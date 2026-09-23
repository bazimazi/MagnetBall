import { overlapsRect } from "../core/math";
import type { Cycle, Face, Motion, Polarity } from "../core/types";

export function poseOf(
  x: number,
  y: number,
  motion: Motion | undefined,
  time: number,
): { x: number; y: number } {
  if (!motion) return { x, y };
  const s = Math.sin(time * motion.omega + (motion.phase ?? 0));
  return { x: x + s * (motion.ampX ?? 0), y: y + s * (motion.ampY ?? 0) };
}

export function cycledPolarity(
  base: -1 | 1,
  cycle: Cycle | undefined,
  time: number,
): -1 | 1 {
  if (!cycle || cycle.period <= 0) return base;
  const s = Math.sin((time * Math.PI * 2) / cycle.period + (cycle.phase ?? 0));
  return s >= 0 ? base : base === 1 ? -1 : 1;
}

export function faceFrame(
  face: Face,
  x: number,
  y: number,
  w: number,
  h: number,
): { ax: number; ay: number; bx: number; by: number; nx: number; ny: number } {
  switch (face) {
    case "up":
      return { ax: x, ay: y, bx: x + w, by: y, nx: 0, ny: -1 };
    case "down":
      return { ax: x, ay: y + h, bx: x + w, by: y + h, nx: 0, ny: 1 };
    case "right":
      return { ax: x + w, ay: y, bx: x + w, by: y + h, nx: 1, ny: 0 };
    case "left":
      return { ax: x, ay: y, bx: x, by: y + h, nx: -1, ny: 0 };
  }
}

export function samePole(a: Polarity, b: Polarity): boolean {
  return a !== 0 && b !== 0 && a * b > 0;
}

export function laserActive(period: number | undefined, phase: number | undefined, time: number): boolean {
  if (!period || period <= 0) return true;
  const u = (((time / period + (phase ?? 0)) % 1) + 1) % 1;
  return u < 0.5;
}

export function rectContains(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  return overlapsRect(px, py, x, y, w, h);
}
