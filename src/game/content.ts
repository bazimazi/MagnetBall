import type { LevelDef } from "../core/types";

export interface CodexEntry {
  id: string;
  title: string;
  body: string;
}

export interface WorldInfo {
  id: number;
  name: string;
  wing: string;
  summary: string;
  sealed?: boolean;
}

export const WORLDS: WorldInfo[] = [
  {
    id: 1,
    name: "First Contact",
    wing: "Wing A",
    summary: "The old stones still answer. Learn which way a pole leans.",
  },
  {
    id: 2,
    name: "Momentum",
    wing: "Wing B",
    summary: "A force changes velocity. It does not place you.",
  },
  {
    id: 3,
    name: "Architecture",
    wing: "Wing C",
    summary: "These rooms were built the way a field is built: as a path.",
  },
  {
    id: 4,
    name: "Polarity Machines",
    wing: "Wing D",
    summary: "Doors, locks, and panes that decide a pole for you.",
    sealed: true,
  },
  {
    id: 5,
    name: "Moving Fields",
    wing: "Wing E",
    summary: "Stones that travel, turn, and refuse to wait.",
    sealed: true,
  },
  {
    id: 6,
    name: "Magnetic Engineering",
    wing: "Wing F",
    summary: "Bridges, lifts, and cranes. The room becomes an instrument.",
    sealed: true,
  },
  {
    id: 7,
    name: "Electromagnetism",
    wing: "Wing G",
    summary: "Fields that wake, sleep, pulse, and argue with each other.",
    sealed: true,
  },
  {
    id: 8,
    name: "Hazards",
    wing: "Wing H",
    summary: "The same force, asked to harm. Use it without being kept by it.",
    sealed: true,
  },
  {
    id: 9,
    name: "Many Bodies",
    wing: "Wing I",
    summary: "Two probes. One field. Neither moves alone.",
    sealed: true,
  },
  {
    id: 10,
    name: "The Core",
    wing: "Wing K",
    summary: "Everything learned, in one machine.",
    sealed: true,
  },
];

export const CODEX: CodexEntry[] = [
  {
    id: "attract",
    title: "Opposite poles",
    body: "The probe is drawn toward its opposite. The stone does not chase. The probe does.",
  },
  {
    id: "repel",
    title: "Like poles",
    body: "A north stone will not welcome a north probe. It spends its force pushing the probe away.",
  },
  {
    id: "release",
    title: "Refusal",
    body: "A hold is an attraction you have not yet refused. Flip, and the same stone lets go.",
  },
  {
    id: "sling",
    title: "The turn",
    body: "Fall toward a stone, then change your mind. The speed remains. The force reverses.",
  },
  {
    id: "coast",
    title: "After the field",
    body: "A field can end while you are still inside the motion it gave you. Coasting is part of the throw.",
  },
  {
    id: "brake",
    title: "The cradle",
    body: "Some exits keep only a gentle arrival. Speed is something you can spend before you get there.",
  },
  {
    id: "rail",
    title: "Rails",
    body: "Some fields are paths. While you agree with them, you travel their line and keep what runs along it.",
  },
  {
    id: "shield",
    title: "Ceramic",
    body: "Ceramic does not answer. A stone behind it is a picture of a force, not a force.",
  },
  {
    id: "invert",
    title: "The pane",
    body: "Inside an inversion pane the probe's pole is read backwards. Your hand has not moved. The room has.",
  },
  {
    id: "lane",
    title: "The quiet line",
    body: "Two equal pushes leave a narrow peace between them. Step off that line and one of them wins.",
  },
  {
    id: "shaft",
    title: "The shaft",
    body: "A ceiling can lift, when the room gives the pull nowhere else to spend itself.",
  },
  {
    id: "pendulum",
    title: "A moving stone",
    body: "A stone that travels must be met. Chasing the place it just left is how the swing is missed.",
  },
  {
    id: "wisp",
    title: "Wisp core",
    body: "Lighter than the issued probe. Weak fields redraw it. It keeps less of what it is given.",
  },
  {
    id: "slug",
    title: "Slug core",
    body: "Dense. Gentle fields barely turn it. A hard push is remembered for a long time.",
  },
  {
    id: "reed",
    title: "Reed core",
    body: "It returns almost everything it strikes. Useful, and a little unruly.",
  },
];

export function codexById(id: string): CodexEntry | undefined {
  return CODEX.find((entry) => entry.id === id);
}

export function worldUnlocked(worldId: number, cleared: readonly string[], levels: LevelDef[]): boolean {
  const world = WORLDS.find((w) => w.id === worldId);
  if (!world || world.sealed) return false;
  if (worldId <= 1) return true;
  const prev = levels.filter((level) => level.world === worldId - 1);
  const done = prev.filter((level) => cleared.includes(level.id)).length;
  return done >= Math.min(6, prev.length);
}

export function levelUnlocked(level: LevelDef, cleared: readonly string[], levels: LevelDef[]): boolean {
  if (!worldUnlocked(level.world, cleared, levels)) return false;
  const peers = levels.filter((item) => item.world === level.world);
  const index = peers.findIndex((item) => item.id === level.id);
  if (index <= 0) return true;
  const prev = peers[index - 1];
  return prev ? cleared.includes(prev.id) : false;
}
