import { LEVEL_H, LEVEL_W } from "../physics/constants";
import type { LevelDef } from "../core/types";

function insideChamber(x: number, y: number, pad = 0.2): boolean {
  return x > pad && y > pad && x < LEVEL_W - pad && y < LEVEL_H + 1.2;
}

/** Structural checks a level must pass before anyone plays it. */
export function levelProblems(level: LevelDef): string[] {
  const problems: string[] = [];
  if (!level.id) problems.push("missing id");
  if (!level.name) problems.push("missing name");
  if (!insideChamber(level.ball.x, level.ball.y, -0.2)) problems.push("spawn is outside the chamber");
  if (!insideChamber(level.goal.x, level.goal.y, -0.2)) problems.push("exit is outside the chamber");
  if ((level.goal.r ?? 0.62) <= 0) problems.push("exit radius must be positive");

  const ids = new Set<string>();
  const claim = (id: string) => {
    if (!id) problems.push("magnet is missing an id");
    else if (ids.has(id)) problems.push(`duplicate id ${id}`);
    else ids.add(id);
  };

  for (const plate of level.plates ?? []) {
    claim(plate.id);
    if (plate.w <= 0 || plate.h <= 0) problems.push(`${plate.id} has no area`);
    if (plate.strength <= 0 || plate.range <= 0) problems.push(`${plate.id} needs strength and range`);
    if (plate.polarity !== 1 && plate.polarity !== -1) problems.push(`${plate.id} polarity`);
  }
  for (const orb of level.orbs ?? []) {
    claim(orb.id);
    if (orb.strength <= 0 || orb.range <= 0) problems.push(`${orb.id} needs strength and range`);
  }
  for (const ring of level.rings ?? []) {
    claim(ring.id);
    if (ring.radius <= 0) problems.push(`${ring.id} radius`);
  }
  for (const rail of level.rails ?? []) {
    claim(rail.id);
    const dx = rail.x2 - rail.x1;
    const dy = rail.y2 - rail.y1;
    if (dx * dx + dy * dy < 0.25) problems.push(`${rail.id} is too short`);
  }
  for (const zone of level.zones ?? []) {
    if (zone.kind === "lock" && zone.polarity !== 1 && zone.polarity !== -1) {
      problems.push("lock pane needs a polarity");
    }
  }
  for (const [i, shard] of (level.fragments ?? []).entries()) {
    if (!insideChamber(shard.x, shard.y, -0.5)) problems.push(`shard ${i} is outside`);
  }
  if (level.objectives?.fragments && (level.fragments?.length ?? 0) < 1) {
    problems.push("shard objective but no shards");
  }

  const solids = [
    ...(level.boxes ?? []),
    ...(level.plates ?? []).filter((p) => p.solid !== false),
    ...(level.shields ?? []).filter((s) => s.solid !== false).map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
  ];
  for (const box of solids) {
    const { x, y } = level.ball;
    if (x > box.x && y > box.y && x < box.x + box.w && y < box.y + box.h) {
      problems.push("spawn is buried in a solid");
      break;
    }
  }
  return problems;
}
