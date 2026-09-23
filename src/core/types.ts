export type Polarity = -1 | 0 | 1;
export type Face = "up" | "down" | "left" | "right";
export type ArchetypeId = "probe" | "wisp" | "slug" | "reed";
export type TrajectoryMode = "off" | "short" | "long";
export type FailReason = "void" | "spike" | "beam";

/**
 * Level documents are plain JSON so a future editor can emit them
 * without touching the simulation. All coordinates are in a 20×12 chamber,
 * origin at the top-left, +y downward.
 */
export interface Motion {
  ampX?: number;
  ampY?: number;
  omega: number;
  phase?: number;
}

export interface Cycle {
  period: number;
  phase?: number;
}

export interface BoxDef {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlatformDef {
  x: number;
  y: number;
  w: number;
}

export interface PlateDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  face: Face;
  polarity: -1 | 1;
  strength: number;
  range: number;
  solid?: boolean;
  motion?: Motion;
  cycle?: Cycle;
}

export interface OrbDef {
  id: string;
  x: number;
  y: number;
  r?: number;
  polarity: -1 | 1;
  strength: number;
  range: number;
  solid?: boolean;
  motion?: Motion;
  cycle?: Cycle;
}

export interface RingDef {
  id: string;
  x: number;
  y: number;
  radius: number;
  polarity: -1 | 1;
  strength: number;
  range: number;
  motion?: Motion;
  cycle?: Cycle;
}

export interface RailDef {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  polarity: -1 | 1;
  strength: number;
  range: number;
  capture?: number;
  exitX: number;
  exitY: number;
  motion?: Motion;
  cycle?: Cycle;
}

export interface ShieldDef {
  x: number;
  y: number;
  w: number;
  h: number;
  solid?: boolean;
}

export interface ZoneDef {
  kind: "invert" | "lock";
  x: number;
  y: number;
  w: number;
  h: number;
  polarity?: -1 | 1;
}

export interface LaserDef {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** If set, the beam blinks with this period (seconds), on for the first half. */
  period?: number;
  phase?: number;
}

export interface SpikeDef {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FragmentDef {
  x: number;
  y: number;
}

export interface GoalDef {
  x: number;
  y: number;
  r?: number;
  /** If set, overlapping faster than this rejects the catch. */
  maxSpeed?: number;
}

export interface BallSpawn {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  polarity: -1 | 1;
  archetype?: ArchetypeId;
}

export interface Objectives {
  maxSwitches?: number;
  maxTime?: number;
  fragments?: boolean;
}

export interface LevelDef {
  id: string;
  world: number;
  name: string;
  /** One quiet line under the name. */
  kicker: string;
  ball: BallSpawn;
  goal: GoalDef;
  boxes?: BoxDef[];
  platforms?: PlatformDef[];
  plates?: PlateDef[];
  orbs?: OrbDef[];
  rings?: RingDef[];
  rails?: RailDef[];
  shields?: ShieldDef[];
  zones?: ZoneDef[];
  lasers?: LaserDef[];
  spikes?: SpikeDef[];
  /** Visual pits. Lethal only because the floor is open and the probe falls out. */
  voids?: BoxDef[];
  fragments?: FragmentDef[];
  objectives?: Objectives;
  hint?: string;
  /** Shown once, on the clear card. Teaching levels only. */
  success?: string;
  gravity?: number;
  discover?: string;
  sandbox?: boolean;
  /** Daily / assist override. */
  forceTrajectory?: TrajectoryMode;
}

export interface SimParams {
  gravityScale: number;
  massScale: number;
  magnetScale: number;
  restitutionScale: number;
  sandbox: boolean;
}

export interface Influence {
  id: string;
  x: number;
  y: number;
  ax: number;
  ay: number;
  attract: boolean;
  mag: number;
  used: boolean;
}

export type SimEvent =
  | { type: "bounce"; speed: number; x: number; y: number; nx: number; ny: number }
  | { type: "switch"; polarity: -1 | 1 }
  | { type: "collect"; index: number }
  | { type: "reject" }
  | { type: "win" }
  | { type: "lose"; reason: FailReason }
  | { type: "chime" }
  | { type: "respawn" }
  | { type: "field"; id: string; attract: boolean }
  | { type: "chain"; n: number };

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;
  polarity: -1 | 1;
  mass: number;
  radius: number;
  restitution: number;
  friction: number;
  susceptibility: number;
  maxSpeed: number;
  cooldown: number;
  onGround: boolean;
  contactNX: number;
  contactNY: number;
}

export interface SimState {
  time: number;
  frame: number;
  ball: BallState;
  status: "play" | "won" | "lost";
  failReason: FailReason | null;
  switches: number;
  chain: number;
  bestChain: number;
  chainWindow: number;
  got: boolean[];
  goalArmed: boolean;
  restTime: number;
  fx: number;
  fy: number;
  effective: -1 | 0 | 1;
  desired: -1 | 1 | null;
  influences: Influence[];
  influenceCount: number;
  fieldIds: string[];
  events: SimEvent[];
  rejected: number;
}

export interface Command {
  frame: number;
  polarity: -1 | 1;
}

export const DEFAULT_PARAMS: SimParams = {
  gravityScale: 1,
  massScale: 1,
  magnetScale: 1,
  restitutionScale: 1,
  sandbox: false,
};
