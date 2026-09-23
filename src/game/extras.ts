import type { LevelDef } from "../core/types";
import { LEVEL_H, LEVEL_W } from "../physics/constants";

const H = LEVEL_H;
const W = LEVEL_W;

function walls() {
  return [
    { x: 0, y: 0, w: 0.42, h: H },
    { x: W - 0.42, y: 0, w: 0.42, h: H },
    { x: 0, y: 0, w: W, h: 0.42 },
  ];
}

export const DEMO: LevelDef = {
  id: "demo",
  world: 0,
  name: "Demo",
  kicker: "",
  sandbox: true,
  ball: { x: 7.5, y: 4.2, polarity: 1 },
  goal: { x: 16, y: 8.5, r: 0.7 },
  boxes: [...walls(), { x: 0.42, y: 10.3, w: W - 0.84, h: 1.7 }],
  orbs: [
    { id: "west", x: 4.2, y: 6.4, polarity: -1, strength: 70, range: 7, solid: true },
    { id: "east", x: 15.2, y: 5.2, polarity: 1, strength: 64, range: 6.5, solid: true },
  ],
};

export const LAB: LevelDef[] = [
  {
    id: "lab-twin",
    world: 0,
    name: "Twin Stones",
    kicker: "Two answers, and the space between them.",
    sandbox: true,
    ball: { x: 10, y: 4.2, polarity: 1 },
    goal: { x: 10, y: 9.4, r: 0.7 },
    boxes: [...walls(), { x: 0.42, y: 10.4, w: W - 0.84, h: 1.6 }],
    orbs: [
      { id: "west", x: 5, y: 6.5, polarity: -1, strength: 78, range: 6.5 },
      { id: "east", x: 15, y: 6.5, polarity: 1, strength: 78, range: 6.5 },
    ],
  },
  {
    id: "lab-sling",
    world: 0,
    name: "Sling Bench",
    kicker: "Fall in. Then refuse.",
    sandbox: true,
    ball: { x: 6, y: 2.8, polarity: 1 },
    goal: { x: 15, y: 4.6, r: 0.75 },
    boxes: [...walls(), { x: 0.42, y: 10.4, w: W - 0.84, h: 1.6 }, { x: 12.5, y: 5.2, w: 6, h: 0.45 }],
    plates: [
      {
        id: "pad",
        x: 6.5,
        y: 10.4,
        w: 5,
        h: 1.2,
        face: "up",
        polarity: -1,
        strength: 120,
        range: 6,
      },
    ],
  },
  {
    id: "lab-rail",
    world: 0,
    name: "Rail Bench",
    kicker: "A path you can leave.",
    sandbox: true,
    ball: { x: 3.2, y: 3.2, polarity: 1 },
    goal: { x: 10, y: 8.6, r: 0.75 },
    boxes: [...walls(), { x: 7, y: 9.2, w: 6, h: 0.5 }],
    rails: [
      {
        id: "line",
        x1: 2.4,
        y1: 3.4,
        x2: 16,
        y2: 6.2,
        polarity: -1,
        strength: 80,
        range: 3,
        capture: 0.9,
        exitX: 0,
        exitY: 1,
      },
    ],
  },
  {
    id: "lab-pulse",
    world: 0,
    name: "Pulse",
    kicker: "This stone cannot keep a single mind.",
    sandbox: true,
    ball: { x: 6, y: 5, polarity: 1 },
    goal: { x: 14.5, y: 8.8, r: 0.7 },
    boxes: [...walls(), { x: 0.42, y: 10.4, w: W - 0.84, h: 1.6 }],
    orbs: [
      {
        id: "pulse",
        x: 12.5,
        y: 6.2,
        polarity: -1,
        strength: 90,
        range: 7,
        solid: false,
        cycle: { period: 2.4 },
      },
    ],
  },
];

export const DAILY: LevelDef[] = [
  {
    id: "d1",
    world: 0,
    name: "Quiet Hour",
    kicker: "Today's trial",
    ball: { x: 3.4, y: 10.06, polarity: 1 },
    goal: { x: 16, y: 9.95, r: 0.9 },
    boxes: [...walls(), { x: 0.42, y: 10.42, w: W - 0.84, h: 1.58 }],
    plates: [
      {
        id: "bed",
        x: 11,
        y: 10.42,
        w: 8,
        h: 1.4,
        face: "up",
        polarity: -1,
        strength: 80,
        range: 9,
      },
    ],
    objectives: { maxSwitches: 0 },
    forceTrajectory: "off",
    hint: "No preview today. The bed is still south.",
  },
  {
    id: "d2",
    world: 0,
    name: "Short Drop",
    kicker: "Today's trial",
    ball: { x: 10, y: 1.8, polarity: 1 },
    goal: { x: 10, y: 6.5, r: 0.9 },
    boxes: [...walls(), { x: 0.42, y: 10.42, w: W - 0.84, h: 1.58 }],
    plates: [
      {
        id: "ceiling",
        x: 6.2,
        y: 0.42,
        w: 7.6,
        h: 0.75,
        face: "down",
        polarity: -1,
        strength: 140,
        range: 2.6,
      },
    ],
    objectives: { maxSwitches: 1 },
    hint: "The ceiling is a courtesy. You may refuse it.",
  },
  {
    id: "d3",
    world: 0,
    name: "Red Line",
    kicker: "Today's trial",
    ball: { x: 14.6, y: 4.4, polarity: 1 },
    goal: { x: 15, y: 2.55, r: 0.7 },
    boxes: [...walls()],
    plates: [
      {
        id: "cap",
        x: 12.2,
        y: 0.5,
        w: 6,
        h: 0.7,
        face: "down",
        polarity: -1,
        strength: 130,
        range: 5.5,
      },
    ],
    lasers: [{ x1: 1.2, y1: 6.2, x2: 18.6, y2: 6.2 }],
    objectives: { maxSwitches: 0 },
    hint: "The beam is below you. The cap above is south.",
  },
  {
    id: "d4",
    world: 0,
    name: "Heavy Day",
    kicker: "Today's trial · gravity sits heavier",
    gravity: 34,
    ball: { x: 14.4, y: 3.6, polarity: 1 },
    goal: { x: 14.6, y: 9.05, r: 0.9 },
    boxes: [...walls(), { x: 11.2, y: 9.7, w: 8, h: 2.3 }],
    plates: [
      {
        id: "catch",
        x: 11.2,
        y: 9.7,
        w: 7.4,
        h: 1.1,
        face: "up",
        polarity: -1,
        strength: 170,
        range: 11,
      },
    ],
    voids: [{ x: 6.4, y: 8, w: 5, h: 4 }],
    objectives: { maxSwitches: 0 },
    hint: "Heavier air. The catch is still south, and still patient.",
  },
];

export function dailyIndex(date = new Date()): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const day = Math.floor(utc / 86_400_000);
  return ((day % DAILY.length) + DAILY.length) % DAILY.length;
}

export function dailyLevel(date = new Date()): LevelDef {
  return DAILY[dailyIndex(date)] ?? DAILY[0]!;
}
