import type { LevelDef } from "../core/types";

export type SlotId = "exit" | "switches" | "time" | "shards";

export interface ObjectiveSlot {
  id: SlotId;
  label: string;
}

export interface Grade {
  slots: ObjectiveSlot[];
  met: Record<SlotId, boolean>;
}

export function objectiveSlots(level: LevelDef): ObjectiveSlot[] {
  const o = level.objectives ?? {};
  const slots: ObjectiveSlot[] = [{ id: "exit", label: "Reach the exit" }];
  if (o.maxSwitches != null) {
    const n = o.maxSwitches;
    slots.push({
      id: "switches",
      label: n === 0 ? "No flips" : `At most ${n} flip${n === 1 ? "" : "s"}`,
    });
  }
  if (o.fragments) slots.push({ id: "shards", label: "Collect every shard" });
  if (o.maxTime != null && slots.length < 3) {
    slots.push({ id: "time", label: `Under ${trim(o.maxTime)}s` });
  }
  return slots;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function gradeRun(
  level: LevelDef,
  run: { status: string; switches: number; time: number; fragments: number },
): Grade {
  const slots = objectiveSlots(level);
  const o = level.objectives ?? {};
  const shardTotal = level.fragments?.length ?? 0;
  const met: Record<SlotId, boolean> = {
    exit: run.status === "won",
    switches: o.maxSwitches == null ? false : run.status === "won" && run.switches <= o.maxSwitches,
    time: o.maxTime == null ? false : run.status === "won" && run.time <= o.maxTime + 1e-3,
    shards: !o.fragments ? false : run.status === "won" && run.fragments >= shardTotal,
  };
  return { slots, met };
}

export function runSatisfies(level: LevelDef, run: { status: string; switches: number; time: number; fragments: number }): string[] {
  const grade = gradeRun(level, run);
  const notes: string[] = [];
  for (const slot of grade.slots) {
    if (!grade.met[slot.id]) notes.push(slot.label);
  }
  return notes;
}
