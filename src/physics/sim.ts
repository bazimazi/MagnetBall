import { clamp, distToSegment } from "../core/math";
import type {
  Command,
  LevelDef,
  SimParams,
  SimState,
  BallState,
  Influence,
  FailReason,
} from "../core/types";
import { DEFAULT_PARAMS } from "../core/types";
import { archetypeOf } from "../game/archetypes";
import { BALL_R, CHAIN_WINDOW, DT, GRAVITY, LEVEL_H, LEVEL_W, SWITCH_DELAY } from "./constants";
import { collideBox, collideCircle, collidePlatform } from "./collision";
import { effectivePolarity, magneticForces } from "./forces";
import { cycledPolarity, laserActive, poseOf } from "./geom";

const INFLUENCE_CAP = 10;

function blankInfluences(): Influence[] {
  return Array.from({ length: INFLUENCE_CAP }, () => ({
    id: "",
    x: 0,
    y: 0,
    ax: 0,
    ay: 0,
    attract: false,
    mag: 0,
    used: false,
  }));
}

export function createState(level: LevelDef, params: SimParams = DEFAULT_PARAMS): SimState {
  const arch = archetypeOf(level.ball.archetype);
  const ball: BallState = {
    x: level.ball.x,
    y: level.ball.y,
    vx: level.ball.vx ?? 0,
    vy: level.ball.vy ?? 0,
    prevX: level.ball.x,
    prevY: level.ball.y,
    polarity: level.ball.polarity,
    mass: arch.mass * params.massScale,
    radius: arch.radius,
    restitution: clamp(arch.restitution * params.restitutionScale, 0, 0.98),
    friction: arch.friction,
    susceptibility: arch.susceptibility,
    maxSpeed: arch.maxSpeed,
    cooldown: 0,
    onGround: false,
    contactNX: 0,
    contactNY: 0,
  };
  return {
    time: 0,
    frame: 0,
    ball,
    status: "play",
    failReason: null,
    switches: 0,
    chain: 0,
    bestChain: 0,
    chainWindow: 0,
    got: (level.fragments ?? []).map(() => false),
    goalArmed: true,
    restTime: 0,
    fx: 0,
    fy: 0,
    effective: level.ball.polarity,
    desired: null,
    influences: blankInfluences(),
    influenceCount: 0,
    fieldIds: [],
    events: [],
    rejected: 0,
  };
}

export function cloneState(state: SimState): SimState {
  return {
    ...state,
    ball: { ...state.ball },
    got: state.got.slice(),
    fieldIds: state.fieldIds.slice(),
    influences: blankInfluences(),
    influenceCount: 0,
    events: [],
    desired: state.desired,
  };
}

function applyArchetypeScales(level: LevelDef, state: SimState, params: SimParams): void {
  const arch = archetypeOf(level.ball.archetype);
  const b = state.ball;
  b.mass = arch.mass * params.massScale;
  b.restitution = clamp(arch.restitution * params.restitutionScale, 0, 0.98);
  b.friction = arch.friction;
  b.susceptibility = arch.susceptibility;
  b.maxSpeed = arch.maxSpeed;
}

function link(state: SimState, quiet = false): void {
  if (state.chainWindow <= 0) state.chain = 0;
  state.chain += 1;
  state.chainWindow = CHAIN_WINDOW;
  if (state.chain > state.bestChain) state.bestChain = state.chain;
  if (!quiet && state.chain >= 3) state.events.push({ type: "chain", n: state.chain });
}

function fail(state: SimState, reason: FailReason): void {
  state.status = "lost";
  state.failReason = reason;
  state.events.push({ type: "lose", reason });
}

/**
 * One fixed step. Given the same level, params, and commands, the result is
 * identical. Commands are absolute polarity requests applied on their frame;
 * a request issued during the switch delay is held and applied as soon as
 * the delay ends, so a tap is never discarded.
 */
export function step(
  level: LevelDef,
  state: SimState,
  params: SimParams = DEFAULT_PARAMS,
  commands?: Command[],
): void {
  if (state.status !== "play") return;
  state.events.length = 0;
  const b = state.ball;
  applyArchetypeScales(level, state, params);

  if (commands) {
    for (const cmd of commands) {
      if (cmd.frame === state.frame) state.desired = cmd.polarity;
    }
  }

  if (b.cooldown > 0) b.cooldown = Math.max(0, b.cooldown - DT);
  if (state.desired !== null && b.cooldown <= 0 && state.desired !== b.polarity) {
    b.polarity = state.desired;
    b.cooldown = SWITCH_DELAY;
    state.switches += 1;
    state.desired = null;
    state.events.push({ type: "switch", polarity: b.polarity });
    link(state);
  } else if (state.desired === b.polarity) {
    state.desired = null;
  }

  const effective = effectivePolarity(level, b.x, b.y, b.polarity);
  state.effective = effective;

  const g = (level.gravity ?? GRAVITY) * params.gravityScale;
  b.vy += g * DT;

  const hits = magneticForces(level, state, state.time, effective, params.magnetScale);
  let fx = 0;
  let fy = 0;
  const nextFields: string[] = [];
  hits.sort((a, c) => (a.id < c.id ? -1 : a.id > c.id ? 1 : 0));
  for (const hit of hits) {
    fx += hit.ax;
    fy += hit.ay;
    nextFields.push(hit.id);
  }
  b.vx += fx * DT;
  b.vy += fy * DT;
  state.fx = fx;
  state.fy = fy;

  const speed = Math.hypot(b.vx, b.vy);
  if (speed > b.maxSpeed) {
    const k = b.maxSpeed / speed;
    b.vx *= k;
    b.vy *= k;
  }

  let count = 0;
  for (const hit of hits) {
    if (count >= INFLUENCE_CAP) break;
    const slot = state.influences[count];
    if (!slot) break;
    slot.id = hit.id;
    slot.x = hit.x;
    slot.y = hit.y;
    slot.ax = hit.ax;
    slot.ay = hit.ay;
    slot.attract = hit.attract;
    slot.mag = hit.mag;
    slot.used = true;
    count += 1;
  }
  state.influenceCount = count;

  for (const id of nextFields) {
    if (!state.fieldIds.includes(id)) {
      const hit = hits.find((h) => h.id === id);
      state.events.push({ type: "field", id, attract: hit?.attract ?? true });
      link(state, true);
    }
  }
  state.fieldIds = nextFields;

  b.prevX = b.x;
  b.prevY = b.y;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.onGround = false;
  b.contactNX = 0;
  b.contactNY = 0;

  const e = b.restitution;
  for (let pass = 0; pass < 2; pass++) {
    for (const box of level.boxes ?? []) collideBox(b, box.x, box.y, box.w, box.h, e, state.events);
    for (const plat of level.platforms ?? []) collidePlatform(b, plat.x, plat.y, plat.w, e, state.events);
    for (const plate of level.plates ?? []) {
      if (plate.solid === false) continue;
      const pose = poseOf(plate.x, plate.y, plate.motion, state.time);
      collideBox(b, pose.x, pose.y, plate.w, plate.h, e, state.events);
    }
    for (const orb of level.orbs ?? []) {
      if (orb.solid === false) continue;
      const pose = poseOf(orb.x, orb.y, orb.motion, state.time);
      collideCircle(b, pose.x, pose.y, orb.r ?? 0.48, e, state.events);
    }
    for (const shield of level.shields ?? []) {
      if (shield.solid === false) continue;
      collideBox(b, shield.x, shield.y, shield.w, shield.h, e, state.events);
    }
  }

  applyRails(level, state, effective);

  const frags = level.fragments ?? [];
  for (let i = 0; i < frags.length; i++) {
    if (state.got[i]) continue;
    const f = frags[i];
    if (!f) continue;
    if (Math.hypot(b.x - f.x, b.y - f.y) < b.radius + 0.28) {
      state.got[i] = true;
      state.events.push({ type: "collect", index: i });
    }
  }

  for (const spike of level.spikes ?? []) {
    if (circleHitsRect(b.x, b.y, b.radius * 0.82, spike.x, spike.y, spike.w, spike.h)) {
      fail(state, "spike");
      break;
    }
  }

  if (state.status === "play") {
    for (const beam of level.lasers ?? []) {
      if (!laserActive(beam.period, beam.phase, state.time)) continue;
      const d = distToSegment(b.x, b.y, beam.x1, beam.y1, beam.x2, beam.y2);
      if (d.dist < b.radius + 0.08) {
        fail(state, "beam");
        break;
      }
    }
  }

  if (state.status === "play") {
    const oob =
      b.x < -0.8 || b.x > LEVEL_W + 0.8 || b.y > LEVEL_H + 0.35 || b.y < -1.2;
    if (oob) {
      if (params.sandbox) {
        b.x = level.ball.x;
        b.y = level.ball.y;
        b.vx = 0;
        b.vy = 0;
        b.prevX = b.x;
        b.prevY = b.y;
        state.events.push({ type: "respawn" });
      } else {
        fail(state, "void");
      }
    }
  }

  if (state.status === "play") {
    const goal = level.goal;
    const gr = goal.r ?? 0.62;
    const dx = b.x - goal.x;
    const dy = b.y - goal.y;
    const dist = Math.hypot(dx, dy);
    const sp = Math.hypot(b.vx, b.vy);
    const tooFast = goal.maxSpeed != null && sp > goal.maxSpeed;
    if (dist < gr && !tooFast) {
      if (params.sandbox) {
        if (state.goalArmed) {
          state.events.push({ type: "chime" });
          state.goalArmed = false;
        }
      } else {
        state.status = "won";
        state.events.push({ type: "win" });
      }
    } else if (dist < gr && tooFast) {
      if (state.rejected <= 0) state.events.push({ type: "reject" });
      state.rejected = 0.45;
    } else if (!state.goalArmed && dist > gr * 1.45) {
      state.goalArmed = true;
    }
  }

  if (state.rejected > 0) state.rejected -= DT;
  if (state.chainWindow > 0) state.chainWindow -= DT;
  else state.chain = 0;

  const sp2 = b.vx * b.vx + b.vy * b.vy;
  if (sp2 < 0.02 && state.frame > 20) state.restTime += DT;
  else state.restTime = 0;

  state.time += DT;
  state.frame += 1;
}

function applyRails(level: LevelDef, state: SimState, effective: -1 | 0 | 1): void {
  if (effective === 0) return;
  const b = state.ball;
  for (const rail of level.rails ?? []) {
    const pol = cycledPolarity(rail.polarity, rail.cycle, state.time);
    const attract = effective * pol < 0;
    const a = poseOf(rail.x1, rail.y1, rail.motion, state.time);
    const bp = poseOf(rail.x2, rail.y2, rail.motion, state.time);
    const seg = distToSegment(b.x, b.y, a.x, a.y, bp.x, bp.y);
    const capture = rail.capture ?? 0.7;
    if (!attract || seg.dist > capture || seg.t <= 0.02 || seg.t >= 0.98) continue;
    const abx = bp.x - a.x;
    const aby = bp.y - a.y;
    const len = Math.hypot(abx, aby) || 1;
    const tx = abx / len;
    const ty = aby / len;
    b.x = seg.cx;
    b.y = seg.cy;
    // Keep the along-rail velocity (including this step's gravity) and
    // discard the component that would pull the rider off the line.
    const vt = b.vx * tx + b.vy * ty;
    b.vx = tx * vt;
    b.vy = ty * vt;
  }
}

function circleHitsRect(
  cx: number,
  cy: number,
  r: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

export interface RunResult {
  status: SimState["status"];
  time: number;
  switches: number;
  fragments: number;
  bestChain: number;
  endX: number;
  endY: number;
  endSpeed: number;
  failReason: FailReason | null;
  samples: { t: number; x: number; y: number; p: -1 | 1 }[];
}

export function runSim(
  level: LevelDef,
  commands: Command[],
  seconds: number,
  params: SimParams = DEFAULT_PARAMS,
): RunResult {
  const state = createState(level, params);
  const ordered = [...commands].sort((a, b) => a.frame - b.frame);
  const maxFrame = Math.round(seconds / DT);
  const samples: RunResult["samples"] = [];
  let nextSample = 0;
  while (state.frame < maxFrame && state.status === "play") {
    step(level, state, params, ordered);
    if (state.time + 1e-6 >= nextSample) {
      samples.push({
        t: Math.round(state.time * 100) / 100,
        x: Math.round(state.ball.x * 100) / 100,
        y: Math.round(state.ball.y * 100) / 100,
        p: state.ball.polarity,
      });
      nextSample += 0.25;
    }
  }
  return {
    status: state.status,
    time: state.time,
    switches: state.switches,
    fragments: state.got.filter(Boolean).length,
    bestChain: state.bestChain,
    endX: state.ball.x,
    endY: state.ball.y,
    endSpeed: Math.hypot(state.ball.vx, state.ball.vy),
    failReason: state.failReason,
    samples,
  };
}

export function toggles(level: LevelDef, times: number[]): Command[] {
  let p: -1 | 1 = level.ball.polarity;
  return times.map((t) => {
    p = p === 1 ? -1 : 1;
    return { frame: Math.max(0, Math.round(t / DT)), polarity: p };
  });
}

export function previewPath(
  level: LevelDef,
  state: SimState,
  params: SimParams,
  seconds: number,
): { x: number; y: number; lost: boolean }[] {
  const ghost = cloneState(state);
  ghost.status = "play";
  ghost.events = [];
  const pts: { x: number; y: number; lost: boolean }[] = [];
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    if (readStatus(ghost) !== "play") break;
    step(level, ghost, params);
    if (i % 4 === 0) {
      pts.push({
        x: ghost.ball.x,
        y: ghost.ball.y,
        lost: readStatus(ghost) === "lost",
      });
    }
  }
  if (readStatus(ghost) === "lost" && pts.length) {
    const last = pts[pts.length - 1];
    if (last) last.lost = true;
  }
  return pts;
}

function readStatus(state: SimState): SimState["status"] {
  return state.status;
}

export { BALL_R };
