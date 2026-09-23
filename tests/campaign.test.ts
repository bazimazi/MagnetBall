import { describe, expect, it } from "vitest";
import { DAILY } from "../src/game/extras";
import { runSatisfies } from "../src/game/grade";
import { CAMPAIGN } from "../src/game/levels";
import { levelProblems } from "../src/game/validate";
import { runSim, toggles } from "../src/physics/sim";
import { SOLUTIONS } from "./solutions";

describe("level structure", () => {
  it("gives every campaign and daily room a clean document", () => {
    const ids = new Set<string>();
    for (const level of [...CAMPAIGN, ...DAILY]) {
      expect(ids.has(level.id), level.id).toBe(false);
      ids.add(level.id);
      expect(levelProblems(level), level.id).toEqual([]);
    }
  });
});

describe("institute solutions", () => {
  it("replays a run that meets every objective", () => {
    for (const level of [...CAMPAIGN, ...DAILY]) {
      const times = SOLUTIONS[level.id];
      expect(times, level.id).toBeDefined();
      const result = runSim(level, toggles(level, times ?? []), 12);
      expect(runSatisfies(level, result), `${level.id} ended at ${result.endX.toFixed(2)},${result.endY.toFixed(2)}`).toEqual(
        [],
      );
    }
  });
});
