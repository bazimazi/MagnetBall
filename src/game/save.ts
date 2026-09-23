import type { Settings } from "./settings";
import { DEFAULT_SETTINGS } from "./settings";

const KEY = "magnet-ball-v1";

export interface ClearRecord {
  switches: number;
  time: number;
  fragments: number;
  chain: number;
  exit: boolean;
  switchesMet: boolean;
  shardsMet: boolean;
  timeMet: boolean;
}

export interface LevelStat {
  attempts: number;
  fails: number;
  wins: number;
  restarts: number;
  hints: number;
  playMs: number;
  spots: { x: number; y: number }[];
}

export interface SaveData {
  v: 1;
  cleared: Record<string, ClearRecord>;
  stats: Record<string, LevelStat>;
  settings: Settings;
  codex: string[];
  seenWorlds: number[];
  taughtFlip: boolean;
  dailies: string[];
}

export function emptySave(reducedMotion: boolean): SaveData {
  const settings = { ...DEFAULT_SETTINGS };
  if (reducedMotion) {
    settings.reducedMotion = true;
    settings.shake = "off";
    settings.particles = "reduced";
    settings.trajectory = "long";
  }
  return {
    v: 1,
    cleared: {},
    stats: {},
    settings,
    codex: [],
    seenWorlds: [],
    taughtFlip: false,
    dailies: [],
  };
}

export function loadSave(): SaveData {
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave(reduced);
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.v !== 1) return emptySave(reduced);
    return {
      ...emptySave(false),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      cleared: parsed.cleared ?? {},
      stats: parsed.stats ?? {},
      codex: parsed.codex ?? [],
      seenWorlds: parsed.seenWorlds ?? [],
      dailies: parsed.dailies ?? [],
    };
  } catch {
    return emptySave(reduced);
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode and full disks should not take the run with them */
  }
}

export function statFor(save: SaveData, id: string): LevelStat {
  return (
    save.stats[id] ?? {
      attempts: 0,
      fails: 0,
      wins: 0,
      restarts: 0,
      hints: 0,
      playMs: 0,
      spots: [],
    }
  );
}

export function mergeClear(prev: ClearRecord | undefined, next: ClearRecord): ClearRecord {
  if (!prev) return next;
  return {
    switches: Math.min(prev.switches, next.switches),
    time: Math.min(prev.time, next.time),
    fragments: Math.max(prev.fragments, next.fragments),
    chain: Math.max(prev.chain, next.chain),
    exit: prev.exit || next.exit,
    switchesMet: prev.switchesMet || next.switchesMet,
    shardsMet: prev.shardsMet || next.shardsMet,
    timeMet: prev.timeMet || next.timeMet,
  };
}
