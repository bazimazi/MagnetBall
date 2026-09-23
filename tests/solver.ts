import type { LevelDef } from "../src/core/types";
import { runSatisfies } from "../src/game/grade";
import { runSim, toggles, type RunResult } from "../src/physics/sim";

export interface SolveOptions {
  maxFlips?: number;
  horizon?: number;
  step?: number;
}

function grid(step: number, horizon: number, phase: number): number[] {
  const times: number[] = [];
  for (let t = phase; t <= horizon + 1e-6; t += step) {
    times.push(Math.round(t * 1000) / 1000);
  }
  return times;
}

function run(level: LevelDef, times: number[], horizon: number): RunResult {
  return runSim(level, toggles(level, times), horizon);
}

/**
 * Earliest low-flip script that meets every authored objective.
 * A first failure prunes later flips: if doing nothing dies at t, every
 * saved run must flip before that.
 */
export function solve(level: LevelDef, options: SolveOptions = {}): number[] | null {
  const maxFlips = options.maxFlips ?? 2;
  const horizon = options.horizon ?? 8;
  const step = options.step ?? 0.22;
  const quiet = run(level, [], horizon);
  if (runSatisfies(level, quiet).length === 0) return [];
  const limit = quiet.status === "lost" ? Math.max(0.05, quiet.time - 0.04) : horizon;

  for (const phase of [0, step * 0.5]) {
    const times = grid(step, limit, phase).filter((t) => t <= limit + 1e-6);
    for (let flips = 1; flips <= maxFlips; flips++) {
      const found = search(level, times, flips, horizon);
      if (found) return found;
    }
  }
  return null;
}

function search(level: LevelDef, times: number[], flips: number, horizon: number): number[] | null {
  if (flips === 0) {
    const result = run(level, [], horizon);
    return runSatisfies(level, result).length === 0 ? [] : null;
  }
  const chosen: number[] = [];
  const walk = (start: number, left: number): number[] | null => {
    if (left === 0) {
      const result = run(level, chosen, horizon);
      return runSatisfies(level, result).length === 0 ? chosen.slice() : null;
    }
    for (let i = start; i < times.length; i++) {
      chosen.push(times[i] ?? 0);
      const found = walk(i + 1, left - 1);
      if (found) return found;
      chosen.pop();
    }
    return null;
  };
  return walk(0, flips);
}

export function diagnose(level: LevelDef, horizon = 8): string {
  const result = run(level, [], horizon);
  let best = Infinity;
  let at = result.samples[0];
  for (const sample of result.samples) {
    const d = Math.hypot(sample.x - level.goal.x, sample.y - level.goal.y);
    if (d < best) {
      best = d;
      at = sample;
    }
  }
  return [
    `${level.id} ${result.status} flips? end=(${result.endX.toFixed(2)},${result.endY.toFixed(2)}) speed=${result.endSpeed.toFixed(2)} closest=${best.toFixed(2)}`,
    `near ${JSON.stringify(at)}`,
    result.samples.map((s) => `${s.t}s (${s.x},${s.y}) p${s.p}`).join(" | "),
  ].join("\n");
}
