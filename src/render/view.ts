import type { FailReason, LevelDef, Polarity, SimEvent, SimState } from "../core/types";
import { LEVEL_H, LEVEL_W } from "../physics/constants";
import { cycledPolarity, faceFrame, laserActive, poseOf } from "../physics/geom";
import type { Settings } from "../game/settings";

type ParticleKind = "dot" | "spark" | "shard";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: ParticleKind;
  spin: number;
  angle: number;
  gravity: number;
  glow: boolean;
}

interface Ring {
  x: number;
  y: number;
  from: number;
  to: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

interface Float {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  color: string;
}

interface TrailPoint {
  x: number;
  y: number;
  p: number;
}

export interface Mark {
  x: number;
  y: number;
  label: string;
  life: number;
}

export interface FrameInput {
  level: LevelDef;
  state: SimState;
  preview: { x: number; y: number; lost: boolean }[];
  settings: Settings;
  debug: boolean;
  failDots: { x: number; y: number }[];
  mark: Mark | null;
  /** Screen pixels kept clear for the HUD above and below the chamber. */
  inset: { top: number; bottom: number };
}

const NORTH = "#ff8f3f";
const SOUTH = "#34d8c6";
const IVORY = "#f6f0e4";
const BRASS = "#e3b872";
const DANGER = "#ff5b4a";

function pole(p: Polarity | -1 | 1): string {
  return p < 0 ? SOUTH : NORTH;
}

function hash(i: number, k = 0): number {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function frac(v: number): number {
  return v - Math.floor(v);
}

function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

function easeOutBack(t: number): number {
  const c = 1.7;
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

function easeInCubic(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * u;
}

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexRgb(a);
  const [br, bg, bb] = hexRgb(b);
  const k = Math.min(1, Math.max(0, t));
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return `rgb(${r},${g},${bl})`;
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const glowCache = new Map<string, HTMLCanvasElement>();

/** A soft radial sprite, drawn additively for every glow in the room. */
function glowSprite(color: string): HTMLCanvasElement {
  const hit = glowCache.get(color);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.25, rgba(color, 0.45));
    grad.addColorStop(0.6, rgba(color, 0.12));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  glowCache.set(color, c);
  return c;
}

function makeNoise(): CanvasPattern | null {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  const image = g.createImageData(128, 128);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 90 + Math.random() * 70;
    image.data[i] = v;
    image.data[i + 1] = v - 6;
    image.data[i + 2] = v - 18;
    image.data[i + 3] = 34;
  }
  g.putImageData(image, 0, 0);
  return g.createPattern(c, "repeat");
}

export class View {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private floats: Float[] = [];
  private trauma = 0;
  private squash = 0;
  private squashNX = 0;
  private squashNY = -1;
  private trail: TrailPoint[] = [];
  private trailTick = 0;
  private noise: CanvasPattern | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private cache: HTMLCanvasElement | null = null;
  private cacheKey = "";
  private cacheLevel: LevelDef | null = null;
  private clock = 0;
  private spin = 0;
  private flipPop = 0;
  private polFrom = NORTH;
  private polTo = NORTH;
  private polMix = 1;
  private lastPol = 0;
  private flash = 0;
  private flashColor = IVORY;
  private intro = 1;
  private spawn = 1;
  private winT = -1;
  private lostT = -1;
  private goalFlare = 0;
  private hot = new Map<string, number>();
  private inset = { top: 0, bottom: 0 };
  private zoom = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    this.ctx = ctx;
    this.noise = makeNoise();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.vignette = null;
    this.cacheKey = "";
  }

  clearTrail(): void {
    this.trail.length = 0;
  }

  /** A new room: the chamber assembles and the probe materializes. */
  enter(level: LevelDef, reducedMotion: boolean): void {
    this.reset();
    this.cacheLevel = level;
    this.cacheKey = "";
    this.intro = reducedMotion ? 1 : 0;
    this.spawn = reducedMotion ? 1 : -0.35;
    this.zoom = reducedMotion ? 1 : 1.05;
  }

  /** Same room, fresh probe. */
  respawn(reducedMotion: boolean): void {
    this.reset();
    this.spawn = reducedMotion ? 1 : 0;
  }

  private reset(): void {
    this.trail.length = 0;
    this.particles.length = 0;
    this.rings.length = 0;
    this.floats.length = 0;
    this.winT = -1;
    this.lostT = -1;
    this.squash = 0;
    this.flipPop = 0;
    this.goalFlare = 0;
    this.polMix = 1;
    this.lastPol = 0;
    this.hot.clear();
  }

  ingest(events: SimEvent[], settings: Settings, level: LevelDef, state: SimState): void {
    const quiet = settings.particles === "reduced" || settings.reducedMotion;
    const cap = quiet ? 60 : 260;
    const ball = state.ball;
    for (const event of events) {
      if (event.type === "bounce") {
        const k = Math.min(1, event.speed / 9);
        this.squash = Math.max(this.squash, k);
        this.squashNX = event.nx;
        this.squashNY = event.ny;
        this.shake(settings, event.speed / 44);
        const cx = event.x - event.nx * ball.radius;
        const cy = event.y - event.ny * ball.radius;
        if (!quiet) this.dust(cx, cy, event.nx, event.ny, Math.round(4 + k * 10), event.speed);
        if (event.speed > 5) this.ring(cx, cy, 0.1, 0.5 + k * 0.6, 0.28, IVORY, 0.04);
      } else if (event.type === "switch") {
        const color = pole(event.polarity);
        this.ring(ball.x, ball.y, ball.radius * 0.9, ball.radius * 3.4, 0.42, color, 0.07);
        if (!quiet) this.ring(ball.x, ball.y, ball.radius, ball.radius * 2.2, 0.3, IVORY, 0.03);
        this.sparks(ball.x, ball.y, quiet ? 5 : 14, color, 5.5);
        this.flipPop = 1;
      } else if (event.type === "collect") {
        const shard = level.fragments?.[event.index];
        const x = shard?.x ?? ball.x;
        const y = shard?.y ?? ball.y;
        this.ring(x, y, 0.1, 1.2, 0.45, BRASS, 0.06);
        this.sparks(x, y, quiet ? 6 : 18, BRASS, 6);
        const got = state.got.filter(Boolean).length;
        this.text(x, y - 0.45, `${got} / ${state.got.length}`, BRASS);
        this.flash = Math.max(this.flash, 0.08);
        this.flashColor = BRASS;
      } else if (event.type === "win") {
        this.winT = 0;
        this.goalFlare = 1;
        const g = level.goal;
        this.ring(g.x, g.y, 0.2, 3.2, 0.7, BRASS, 0.09);
        this.ring(g.x, g.y, 0.2, 2, 0.5, IVORY, 0.05);
        this.sparks(g.x, g.y, quiet ? 10 : 36, BRASS, 8);
        if (!quiet) this.sparks(g.x, g.y, 14, IVORY, 5);
        this.flash = 0.22;
        this.flashColor = BRASS;
        this.shake(settings, 0.25);
      } else if (event.type === "chime") {
        const g = level.goal;
        this.ring(g.x, g.y, 0.2, 2, 0.5, BRASS, 0.06);
        this.sparks(g.x, g.y, quiet ? 6 : 16, BRASS, 5);
      } else if (event.type === "lose") {
        this.lostT = 0;
        this.shatter(ball.x, ball.y, pole(state.effective || ball.polarity), event.reason, quiet);
        this.flash = 0.3;
        this.flashColor = DANGER;
        this.shake(settings, 0.55);
      } else if (event.type === "reject") {
        const g = level.goal;
        this.ring(g.x, g.y, (g.r ?? 0.62) * 1.4, (g.r ?? 0.62) * 0.8, 0.3, DANGER, 0.06);
        this.text(g.x, g.y - (g.r ?? 0.62) - 0.35, "Too fast", DANGER);
      } else if (event.type === "chain" && !settings.reducedMotion) {
        this.text(ball.x, ball.y - ball.radius - 0.5, `Chain ×${event.n}`, BRASS);
      } else if (event.type === "field") {
        this.hot.set(event.id, 1);
      } else if (event.type === "respawn") {
        this.spawn = settings.reducedMotion ? 1 : 0;
        this.trail.length = 0;
      }
    }
    if (this.particles.length > cap) this.particles.splice(0, this.particles.length - cap);
  }

  private shake(settings: Settings, amount: number): void {
    if (settings.shake === "off" || settings.reducedMotion) return;
    const scale = settings.shake === "reduced" ? 0.35 : 1;
    this.trauma = Math.min(1, this.trauma + amount * scale);
  }

  private ring(x: number, y: number, from: number, to: number, max: number, color: string, width: number): void {
    this.rings.push({ x, y, from, to, life: max, max, color, width });
  }

  private text(x: number, y: number, text: string, color: string): void {
    this.floats.push({ x, y, text, life: 1.1, max: 1.1, color });
  }

  private add(p: Partial<Particle> & Pick<Particle, "x" | "y" | "vx" | "vy" | "color">): void {
    const life = p.life ?? 0.5;
    this.particles.push({
      life,
      max: life,
      size: 0.06,
      kind: "dot",
      spin: 0,
      angle: 0,
      gravity: 6,
      glow: false,
      ...p,
    });
  }

  private dust(x: number, y: number, nx: number, ny: number, n: number, speed: number): void {
    const tx = -ny;
    const ty = nx;
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const along = (0.6 + Math.random() * 1.6) * side * (0.5 + speed * 0.12);
      const out = 0.3 + Math.random() * (0.6 + speed * 0.1);
      this.add({
        x,
        y,
        vx: tx * along + nx * out,
        vy: ty * along + ny * out,
        life: 0.3 + Math.random() * 0.35,
        color: "#cbbba0",
        size: 0.035 + Math.random() * 0.06,
        gravity: 3,
      });
    }
  }

  private sparks(x: number, y: number, n: number, color: string, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.75);
      this.add({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.35 + Math.random() * 0.4,
        color,
        size: 0.05 + Math.random() * 0.05,
        kind: "spark",
        gravity: 4,
        glow: true,
      });
    }
  }

  private shatter(x: number, y: number, color: string, reason: FailReason, quiet: boolean): void {
    const n = quiet ? 8 : 22;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 6;
      const up = reason === "void" ? -3 : -1;
      this.add({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v + up,
        life: 0.6 + Math.random() * 0.6,
        color: i % 3 === 0 ? color : i % 3 === 1 ? "#d9cdb8" : "#7d7061",
        size: 0.07 + Math.random() * 0.1,
        kind: "shard",
        spin: (Math.random() - 0.5) * 18,
        angle: Math.random() * 6,
        gravity: 16,
      });
    }
    this.sparks(x, y, quiet ? 6 : 16, DANGER, 7);
    this.ring(x, y, 0.2, 1.9, 0.5, DANGER, 0.07);
  }

  draw(input: FrameInput, dt: number): void {
    const { ctx } = this;
    const calm = input.settings.reducedMotion;
    this.clock += dt;

    this.step(dt, input);

    // Camera: ease toward the requested HUD inset, settle the intro zoom.
    const k = 1 - Math.exp(-dt * 9);
    this.inset.top += (input.inset.top - this.inset.top) * k;
    this.inset.bottom += (input.inset.bottom - this.inset.bottom) * k;
    this.zoom += (1 - this.zoom) * (1 - Math.exp(-dt * 4));
    const side = Math.min(28, this.cssW * 0.035);
    const availW = this.cssW - side * 2;
    const availH = this.cssH - this.inset.top - this.inset.bottom - 16;
    const scale = Math.max(1, Math.min(availW / LEVEL_W, availH / LEVEL_H)) * this.zoom;
    const shakeAmp = this.trauma * this.trauma * 9;
    const sx = (hash(Math.floor(this.clock * 60), 1) - 0.5) * 2 * shakeAmp;
    const sy = (hash(Math.floor(this.clock * 60), 2) - 0.5) * 2 * shakeAmp;
    const ox = (this.cssW - LEVEL_W * scale) / 2 + sx;
    const oy = this.inset.top + 8 + (availH - LEVEL_H * scale) / 2 + sy;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    this.backdrop();
    this.frame(ox, oy, scale);

    // Static layer: walls, pits, barbs, shields.
    this.ensureCache(input.level, scale, input.settings.contrast);
    const introK = easeOutCubic(this.intro);
    if (this.cache) {
      ctx.save();
      ctx.globalAlpha = introK;
      ctx.drawImage(this.cache, ox, oy, LEVEL_W * scale, LEVEL_H * scale);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = introK;
    this.zones(input);
    this.fields(input);
    this.plates(input);
    this.lasers(input);
    this.rails(input);
    this.orbs(input);
    this.goal(input);
    this.shards(input);
    ctx.globalAlpha = 1;
    this.previewPath(input);
    this.filaments(input);
    if (input.debug) this.debug(input);
    for (const dot of input.failDots) {
      ctx.fillStyle = "rgba(255,91,74,0.45)";
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawTrail(input);
    this.drawRings();
    this.drawBall(input);
    this.drawParticles();
    this.drawFloats();
    if (input.mark && input.mark.life > 0) this.drawMark(input.mark);
    ctx.restore();

    this.post(calm);
  }

  private step(dt: number, input: FrameInput): void {
    const { state, settings } = input;
    const ball = state.ball;
    this.squash = Math.max(0, this.squash - dt * 3.2);
    this.trauma = Math.max(0, this.trauma - dt * 2.2);
    this.flipPop = Math.max(0, this.flipPop - dt * 4);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.goalFlare = Math.max(0, this.goalFlare - dt * 1.2);
    if (this.intro < 1) this.intro = Math.min(1, this.intro + dt / 0.6);
    if (this.spawn < 1) this.spawn = Math.min(1, this.spawn + dt / 0.42);
    if (this.winT >= 0) this.winT += dt;
    if (this.lostT >= 0) this.lostT += dt;
    for (const [id, v] of this.hot) {
      const next = v - dt * 2.5;
      if (next <= 0) this.hot.delete(id);
      else this.hot.set(id, next);
    }

    const pol = state.effective || ball.polarity;
    if (pol !== this.lastPol) {
      this.polFrom = this.lastPol === 0 ? pole(pol) : this.currentPoleColor();
      this.polTo = pole(pol);
      this.polMix = this.lastPol === 0 || settings.reducedMotion ? 1 : 0;
      this.lastPol = pol;
    }
    this.polMix = Math.min(1, this.polMix + dt / 0.16);

    // Rolling: arc length over radius, signed by direction of travel.
    if (state.status === "play") {
      const tangent = ball.onGround ? ball.vx : ball.vx * 0.6;
      this.spin += (tangent / ball.radius) * dt;
    }

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - dt * 1.5;
      p.angle += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const f of this.floats) {
      f.life -= dt;
      f.y -= dt * 0.7;
    }
    this.floats = this.floats.filter((f) => f.life > 0);

    if (!settings.reducedMotion && state.status === "play") {
      this.trailTick += dt;
      if (this.trailTick > 0.016) {
        this.trail.push({ x: ball.x, y: ball.y, p: pol });
        if (this.trail.length > 26) this.trail.shift();
        this.trailTick = 0;
      }
    } else if (this.trail.length) {
      this.trail.shift();
    }
  }

  private currentPoleColor(): string {
    return this.polMix >= 1 ? this.polTo : mix(this.polFrom, this.polTo, this.polMix);
  }

  private backdrop(): void {
    const { ctx } = this;
    const sky = ctx.createRadialGradient(
      this.cssW * 0.5,
      this.cssH * 0.42,
      10,
      this.cssW * 0.5,
      this.cssH * 0.5,
      Math.max(this.cssW, this.cssH) * 0.75,
    );
    sky.addColorStop(0, "#2a241d");
    sky.addColorStop(0.55, "#16130f");
    sky.addColorStop(1, "#0a0908");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (this.noise) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = this.noise;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.restore();
    }
  }

  /** Brass bezel around the chamber, with corner rivets. */
  private frame(ox: number, oy: number, scale: number): void {
    const { ctx } = this;
    const w = LEVEL_W * scale;
    const h = LEVEL_H * scale;
    const pad = Math.max(4, scale * 0.16);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = "#1a1612";
    roundRect(ctx, ox - pad, oy - pad, w + pad * 2, h + pad * 2, pad * 1.2);
    ctx.fill();
    ctx.restore();
    const edge = ctx.createLinearGradient(0, oy - pad, 0, oy + h + pad);
    edge.addColorStop(0, "rgba(242,210,160,0.55)");
    edge.addColorStop(0.5, "rgba(170,130,80,0.35)");
    edge.addColorStop(1, "rgba(242,210,160,0.4)");
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.2;
    roundRect(ctx, ox - pad + 0.5, oy - pad + 0.5, w + pad * 2 - 1, h + pad * 2 - 1, pad * 1.2);
    ctx.stroke();
    const rivet = Math.max(1.5, pad * 0.32);
    ctx.fillStyle = "rgba(227,184,114,0.55)";
    for (const [x, y] of [
      [ox - pad / 2, oy - pad / 2],
      [ox + w + pad / 2, oy - pad / 2],
      [ox - pad / 2, oy + h + pad / 2],
      [ox + w + pad / 2, oy + h + pad / 2],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, rivet, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private ensureCache(level: LevelDef, scale: number, contrast: boolean): void {
    const key = `${level.id}|${scale.toFixed(2)}|${this.dpr}|${contrast ? 1 : 0}`;
    if (this.cache && key === this.cacheKey && this.cacheLevel === level) return;
    this.cacheKey = key;
    this.cacheLevel = level;
    const c = this.cache ?? document.createElement("canvas");
    c.width = Math.max(1, Math.round(LEVEL_W * scale * this.dpr));
    c.height = Math.max(1, Math.round(LEVEL_H * scale * this.dpr));
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(this.dpr * scale, 0, 0, this.dpr * scale, 0, 0);
    paintStatic(g, level, contrast);
    this.cache = c;
  }

  private zones(input: FrameInput): void {
    const { ctx } = this;
    const t = input.settings.reducedMotion ? 0 : this.clock;
    for (const zone of input.level.zones ?? []) {
      const color = zone.kind === "invert" ? BRASS : SOUTH;
      ctx.save();
      ctx.fillStyle = rgba(color, 0.05);
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      ctx.beginPath();
      ctx.rect(zone.x, zone.y, zone.w, zone.h);
      ctx.clip();
      ctx.strokeStyle = rgba(color, 0.03);
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      const off = frac(t * 0.15) * 0.8;
      for (let x = zone.x - zone.h + off; x < zone.x + zone.w; x += 0.8) {
        ctx.moveTo(x, zone.y);
        ctx.lineTo(x + zone.h, zone.y + zone.h);
      }
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = rgba(color, 0.6);
      ctx.lineWidth = 0.04;
      ctx.setLineDash([0.22, 0.16]);
      ctx.lineDashOffset = -t * 0.5;
      ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
      ctx.restore();
    }
  }

  private active(input: FrameInput): Set<string> {
    const { state } = input;
    const active = new Set<string>();
    for (let i = 0; i < state.influenceCount; i++) {
      const hit = state.influences[i];
      if (hit?.used) active.add(hit.id);
    }
    return active;
  }

  /** Field auras and flowing flux: streaks run into an attracting face, out of a repelling one. */
  private fields(input: FrameInput): void {
    const { ctx } = this;
    const { level, state, settings } = input;
    const active = this.active(input);
    const t = settings.reducedMotion ? 0 : state.time;
    const eff = state.effective;
    const baseAlpha = ctx.globalAlpha;

    for (const [pi, plate] of (level.plates ?? []).entries()) {
      const pose = poseOf(plate.x, plate.y, plate.motion, state.time);
      const pol = cycledPolarity(plate.polarity, plate.cycle, state.time);
      const face = faceFrame(plate.face, pose.x, pose.y, plate.w, plate.h);
      const attract = eff * pol < 0;
      const hot = active.has(plate.id) ? 1 : 0;
      const warm = Math.max(hot, this.hot.get(plate.id) ?? 0);
      const color = pole(pol);
      const reach = Math.min(plate.range, 6);

      ctx.save();
      ctx.globalAlpha = baseAlpha * (0.12 + warm * 0.14);
      ctx.beginPath();
      ctx.moveTo(face.ax, face.ay);
      ctx.lineTo(face.bx, face.by);
      ctx.lineTo(face.bx + face.nx * reach, face.by + face.ny * reach);
      ctx.lineTo(face.ax + face.nx * reach, face.ay + face.ny * reach);
      ctx.closePath();
      const grad = ctx.createLinearGradient(
        face.ax,
        face.ay,
        face.ax + face.nx * reach,
        face.ay + face.ny * reach,
      );
      grad.addColorStop(0, color);
      grad.addColorStop(0.45, rgba(color, 0.25));
      grad.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      const len = Math.hypot(face.bx - face.ax, face.by - face.ay);
      const count = Math.max(6, Math.min(44, Math.round(len * 3)));
      const speed = 0.32 + warm * 0.4;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.lineWidth = settings.contrast ? 0.07 : 0.05;
      for (let i = 0; i < count; i++) {
        const seed = pi * 97 + i;
        const u = (i + 0.2 + hash(seed, 1) * 0.6) / count;
        const f = frac(hash(seed, 2) + t * speed * (0.7 + hash(seed, 3) * 0.6));
        const d = (attract ? 1 - f : f) * reach * 0.9;
        const fade = Math.sin(Math.PI * f) * Math.pow(1 - d / reach, 0.8);
        if (fade <= 0.02) continue;
        const x = face.ax + (face.bx - face.ax) * u + face.nx * (d + 0.08);
        const y = face.ay + (face.by - face.ay) * u + face.ny * (d + 0.08);
        const streak = 0.18 + warm * 0.2;
        const dir = attract ? -1 : 1;
        ctx.globalAlpha = baseAlpha * fade * (0.35 + warm * 0.55);
        ctx.beginPath();
        ctx.moveTo(x - face.nx * streak * dir, y - face.ny * streak * dir);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const [oi, orb] of (level.orbs ?? []).entries()) {
      const pose = poseOf(orb.x, orb.y, orb.motion, state.time);
      const pol = cycledPolarity(orb.polarity, orb.cycle, state.time);
      const hot = active.has(orb.id) ? 1 : 0;
      const warm = Math.max(hot, this.hot.get(orb.id) ?? 0);
      const attract = eff * pol < 0;
      const color = pole(pol);
      const r0 = orb.r ?? 0.48;
      const reach = Math.min(orb.range, 6.5);
      const grad = ctx.createRadialGradient(pose.x, pose.y, r0, pose.x, pose.y, reach);
      grad.addColorStop(0, rgba(color, 0.5));
      grad.addColorStop(0.4, rgba(color, 0.12));
      grad.addColorStop(1, rgba(color, 0));
      ctx.save();
      ctx.globalAlpha = baseAlpha * (0.3 + warm * 0.35);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pose.x, pose.y, reach, 0, Math.PI * 2);
      ctx.fill();

      // Equipotential rings drifting in or out.
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.03;
      for (let j = 0; j < 3; j++) {
        const f = frac(j / 3 + t * (0.12 + warm * 0.1));
        const g = attract ? 1 - f : f;
        const rr = r0 + g * (reach - r0) * 0.8;
        ctx.globalAlpha = baseAlpha * Math.sin(Math.PI * f) * (0.12 + warm * 0.2);
        ctx.beginPath();
        ctx.arc(pose.x, pose.y, rr, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineWidth = settings.contrast ? 0.07 : 0.05;
      const n = 22;
      for (let i = 0; i < n; i++) {
        const seed = oi * 131 + i;
        const a = ((i + hash(seed, 1) * 0.5) / n) * Math.PI * 2 + t * 0.08;
        const f = frac(hash(seed, 2) + t * (0.28 + warm * 0.35) * (0.7 + hash(seed, 3) * 0.6));
        const d = r0 + 0.1 + (attract ? 1 - f : f) * (reach - r0) * 0.8;
        const fade = Math.sin(Math.PI * f) * (1 - (d - r0) / reach);
        if (fade <= 0.02) continue;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        const streak = (0.16 + warm * 0.18) * (attract ? -1 : 1);
        ctx.globalAlpha = baseAlpha * fade * (0.3 + warm * 0.55);
        ctx.beginPath();
        ctx.moveTo(pose.x + cx * (d - streak), pose.y + cy * (d - streak));
        ctx.lineTo(pose.x + cx * d, pose.y + cy * d);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const ring of level.rings ?? []) {
      const pose = poseOf(ring.x, ring.y, ring.motion, state.time);
      const pol = cycledPolarity(ring.polarity, ring.cycle, state.time);
      const warm = Math.max(active.has(ring.id) ? 1 : 0, this.hot.get(ring.id) ?? 0);
      const color = pole(pol);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = baseAlpha * (0.4 + warm * 0.4);
      const s = ring.radius + 1.4;
      ctx.drawImage(glowSprite(color), pose.x - s, pose.y - s, s * 2, s * 2);
      ctx.restore();
    }
  }

  private plates(input: FrameInput): void {
    const { ctx } = this;
    const { level, state } = input;
    const active = this.active(input);
    const baseAlpha = ctx.globalAlpha;
    for (const [i, plate] of (level.plates ?? []).entries()) {
      const appear = easeOutBack(this.intro * 1.4 - i * 0.08);
      const pose = poseOf(plate.x, plate.y, plate.motion, state.time);
      const pol = cycledPolarity(plate.polarity, plate.cycle, state.time);
      const face = faceFrame(plate.face, pose.x, pose.y, plate.w, plate.h);
      const color = pole(pol);
      const warm = Math.max(active.has(plate.id) ? 1 : 0, this.hot.get(plate.id) ?? 0);
      if (plate.solid !== false) {
        ctx.save();
        ctx.globalAlpha = baseAlpha * Math.min(1, Math.max(0, appear));
        metal(ctx, pose.x, pose.y, plate.w, plate.h, true);
        // Coil windings across the body, in the plate's pole color.
        ctx.beginPath();
        ctx.rect(pose.x, pose.y, plate.w, plate.h);
        ctx.clip();
        ctx.strokeStyle = rgba(color, 0.22);
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        const horizontal = plate.face === "up" || plate.face === "down";
        const span = horizontal ? plate.w : plate.h;
        for (let s = 0.2; s < span; s += 0.22) {
          if (horizontal) {
            ctx.moveTo(pose.x + s, pose.y);
            ctx.lineTo(pose.x + s, pose.y + plate.h);
          } else {
            ctx.moveTo(pose.x, pose.y + s);
            ctx.lineTo(pose.x + plate.w, pose.y + s);
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      // Emitter face: a lit filament that brightens while it acts on the probe.
      const pulse = input.settings.reducedMotion ? 0 : Math.sin(state.time * 6 + i) * 0.5 + 0.5;
      ctx.save();
      ctx.lineCap = "round";
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = color;
      ctx.globalAlpha = baseAlpha * (0.25 + warm * 0.35 * (0.6 + pulse * 0.4));
      ctx.lineWidth = 0.34;
      ctx.beginPath();
      ctx.moveTo(face.ax, face.ay);
      ctx.lineTo(face.bx, face.by);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = mix(color, IVORY, 0.25 + warm * 0.35);
      ctx.globalAlpha = baseAlpha;
      ctx.lineWidth = input.settings.contrast ? 0.11 : 0.08;
      ctx.beginPath();
      ctx.moveTo(face.ax, face.ay);
      ctx.lineTo(face.bx, face.by);
      ctx.stroke();
      ctx.restore();

      if (plate.solid !== false) {
        const marks = Math.max(2, Math.round(Math.hypot(face.bx - face.ax, face.by - face.ay) / 1.3));
        for (let m = 0; m < marks; m++) {
          const u = (m + 0.5) / marks;
          const x = face.ax + (face.bx - face.ax) * u - face.nx * 0.3;
          const y = face.ay + (face.by - face.ay) * u - face.ny * 0.3;
          glyph(ctx, pol, x, y, 0.12, true);
        }
      }
    }
  }

  private lasers(input: FrameInput): void {
    const { ctx } = this;
    const { state, settings } = input;
    const t = state.time;
    const baseAlpha = ctx.globalAlpha;
    for (const beam of input.level.lasers ?? []) {
      const on = laserActive(beam.period, beam.phase, t);
      let warn = 0;
      if (!on && beam.period) {
        const u = frac(t / beam.period + (beam.phase ?? 0));
        const left = (1 - u) * beam.period;
        if (left < 0.45) warn = 1 - left / 0.45;
      }
      ctx.save();
      ctx.lineCap = "round";
      if (on) {
        const flicker = settings.reducedMotion ? 1 : 0.85 + Math.sin(t * 70) * 0.08 + hash(Math.floor(t * 30)) * 0.07;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = DANGER;
        ctx.globalAlpha = baseAlpha * 0.25 * flicker;
        ctx.lineWidth = 0.5;
        line(ctx, beam.x1, beam.y1, beam.x2, beam.y2);
        ctx.globalAlpha = baseAlpha * 0.6 * flicker;
        ctx.lineWidth = 0.18;
        line(ctx, beam.x1, beam.y1, beam.x2, beam.y2);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = baseAlpha;
        ctx.strokeStyle = "#ffe6dc";
        ctx.lineWidth = 0.05;
        line(ctx, beam.x1, beam.y1, beam.x2, beam.y2);
      } else {
        ctx.strokeStyle = DANGER;
        ctx.globalAlpha = baseAlpha * (0.18 + warn * 0.5 * (settings.reducedMotion ? 1 : Math.abs(Math.sin(t * 28))));
        ctx.lineWidth = 0.04;
        ctx.setLineDash([0.1, 0.18]);
        line(ctx, beam.x1, beam.y1, beam.x2, beam.y2);
      }
      ctx.restore();
      for (const [x, y] of [
        [beam.x1, beam.y1],
        [beam.x2, beam.y2],
      ] as const) {
        ctx.save();
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = "#3a332b";
        ctx.strokeStyle = on ? DANGER : "rgba(227,184,114,0.5)";
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.arc(x, y, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private rails(input: FrameInput): void {
    const { ctx } = this;
    const { state, settings } = input;
    const active = this.active(input);
    const t = settings.reducedMotion ? 0 : state.time;
    const baseAlpha = ctx.globalAlpha;
    for (const [ri, rail] of (input.level.rails ?? []).entries()) {
      const a = poseOf(rail.x1, rail.y1, rail.motion, state.time);
      const b = poseOf(rail.x2, rail.y2, rail.motion, state.time);
      const pol = cycledPolarity(rail.polarity, rail.cycle, state.time);
      const color = pole(pol);
      const warm = Math.max(active.has(rail.id) ? 1 : 0, this.hot.get(rail.id) ?? 0);
      const attract = state.effective * pol < 0;
      ctx.save();
      ctx.lineCap = "round";
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = color;
      ctx.globalAlpha = baseAlpha * (0.18 + warm * 0.3);
      ctx.lineWidth = 0.42;
      line(ctx, a.x, a.y, b.x, b.y);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = baseAlpha;
      ctx.strokeStyle = "#2a241d";
      ctx.lineWidth = 0.16;
      line(ctx, a.x, a.y, b.x, b.y);
      ctx.strokeStyle = mix(color, IVORY, 0.2 + warm * 0.3);
      ctx.lineWidth = 0.06;
      line(ctx, a.x, a.y, b.x, b.y);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(3, Math.round(len * 1.2));
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = IVORY;
      for (let i = 0; i < n; i++) {
        const f = frac(i / n + t * (attract ? 0.25 + warm * 0.3 : 0.08) + ri * 0.13);
        ctx.globalAlpha = baseAlpha * Math.sin(Math.PI * f) * (attract ? 0.8 : 0.3);
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      for (const p of [a, b]) {
        ctx.save();
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = "#4a4136";
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private orbs(input: FrameInput): void {
    const { ctx } = this;
    const { level, state, settings } = input;
    const active = this.active(input);
    const baseAlpha = ctx.globalAlpha;
    for (const [i, orb] of (level.orbs ?? []).entries()) {
      const pose = poseOf(orb.x, orb.y, orb.motion, state.time);
      const pol = cycledPolarity(orb.polarity, orb.cycle, state.time);
      const color = pole(pol);
      const warm = Math.max(active.has(orb.id) ? 1 : 0, this.hot.get(orb.id) ?? 0);
      const appear = Math.max(0, easeOutBack(this.intro * 1.4 - 0.15 - i * 0.1));
      const r = (orb.r ?? 0.48) * appear;
      if (r <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = baseAlpha;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = baseAlpha * (0.45 + warm * 0.4);
      const s = r * 3.2;
      ctx.drawImage(glowSprite(color), pose.x - s, pose.y - s, s * 2, s * 2);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = baseAlpha;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(pose.x + 0.08, pose.y + 0.12, r, 0, Math.PI * 2);
      ctx.fill();
      const grad = ctx.createRadialGradient(pose.x - r * 0.35, pose.y - r * 0.4, r * 0.05, pose.x, pose.y, r);
      grad.addColorStop(0, "#8a7f70");
      grad.addColorStop(0.5, "#4a4238");
      grad.addColorStop(1, "#1d1a15");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pose.x, pose.y, r, 0, Math.PI * 2);
      ctx.fill();
      // Rotating rim segments read as a live coil.
      const rot = settings.reducedMotion ? 0 : state.time * (0.6 + warm * 1.4) * (i % 2 ? -1 : 1);
      ctx.strokeStyle = mix(color, IVORY, warm * 0.3);
      ctx.lineWidth = settings.contrast ? 0.09 : 0.07;
      ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) {
        const a0 = rot + (k * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(pose.x, pose.y, r - 0.02, a0, a0 + 1.5);
        ctx.stroke();
      }
      ctx.restore();
      glyph(ctx, pol, pose.x, pose.y, r * 0.42, false);
    }
    for (const ring of level.rings ?? []) {
      const pose = poseOf(ring.x, ring.y, ring.motion, state.time);
      const pol = cycledPolarity(ring.polarity, ring.cycle, state.time);
      const color = pole(pol);
      const rot = settings.reducedMotion ? 0 : state.time * 0.8;
      ctx.save();
      ctx.globalAlpha = baseAlpha;
      ctx.strokeStyle = "#2a241d";
      ctx.lineWidth = 0.2;
      ctx.beginPath();
      ctx.arc(pose.x, pose.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.08;
      ctx.setLineDash([0.4, 0.18]);
      ctx.lineDashOffset = -rot;
      ctx.stroke();
      ctx.restore();
    }
  }

  private shards(input: FrameInput): void {
    const { ctx } = this;
    const { level, state, settings } = input;
    const baseAlpha = ctx.globalAlpha;
    for (const [index, shard] of (level.fragments ?? []).entries()) {
      if (state.got[index]) continue;
      const t = settings.reducedMotion ? 0 : this.clock;
      const bob = Math.sin(t * 3 + index) * 0.07;
      ctx.save();
      ctx.translate(shard.x, shard.y + bob);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = baseAlpha * (0.55 + Math.sin(t * 4 + index) * 0.15);
      ctx.drawImage(glowSprite(BRASS), -0.7, -0.7, 1.4, 1.4);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = baseAlpha;
      const squeeze = Math.cos(t * 2.2 + index);
      ctx.scale(0.55 + Math.abs(squeeze) * 0.45, 1);
      ctx.beginPath();
      ctx.moveTo(0, -0.24);
      ctx.lineTo(0.17, 0);
      ctx.lineTo(0, 0.24);
      ctx.lineTo(-0.17, 0);
      ctx.closePath();
      const grad = ctx.createLinearGradient(-0.17, -0.24, 0.17, 0.24);
      grad.addColorStop(0, "#fff4d8");
      grad.addColorStop(0.5, BRASS);
      grad.addColorStop(1, "#8a6230");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,244,216,0.8)";
      ctx.lineWidth = 0.025;
      ctx.stroke();
      ctx.restore();
      // Occasional glint.
      const glint = frac(t * 0.4 + index * 0.37);
      if (glint < 0.12) {
        const g = Math.sin((glint / 0.12) * Math.PI);
        ctx.save();
        ctx.globalAlpha = baseAlpha * g;
        ctx.strokeStyle = IVORY;
        ctx.lineWidth = 0.025;
        const x = shard.x + 0.1;
        const y = shard.y + bob - 0.12;
        const s = 0.18 * g;
        line(ctx, x - s, y, x + s, y);
        line(ctx, x, y - s, x, y + s);
        ctx.restore();
      }
    }
  }

  /** The exit is a slow vortex. It flares when the probe is caught. */
  private goal(input: FrameInput): void {
    const { ctx } = this;
    const { level, state, settings } = input;
    const goal = level.goal;
    const r = goal.r ?? 0.62;
    const dist = Math.hypot(state.ball.x - goal.x, state.ball.y - goal.y);
    const speed = Math.hypot(state.ball.vx, state.ball.vy);
    const near = Math.max(0, 1 - (dist - r) / (r * 3));
    const tooFast = goal.maxSpeed != null && speed > goal.maxSpeed && near > 0.3;
    const color = tooFast ? DANGER : BRASS;
    const t = settings.reducedMotion ? 0 : this.clock;
    const flare = this.goalFlare;
    const baseAlpha = ctx.globalAlpha;
    const appear = Math.max(0, easeOutBack(this.intro * 1.3 - 0.2));
    const R = r * appear * (1 + flare * 0.25);
    if (R <= 0.01) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = baseAlpha * (0.35 + near * 0.35 + flare * 0.6);
    const s = R * 2.6;
    ctx.drawImage(glowSprite(color), goal.x - s, goal.y - s, s * 2, s * 2);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = baseAlpha;
    const well = ctx.createRadialGradient(goal.x, goal.y, 0, goal.x, goal.y, R);
    well.addColorStop(0, "#050403");
    well.addColorStop(0.55, "#16110b");
    well.addColorStop(0.9, rgba(color, 0.35));
    well.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = well;
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = "round";
    const spinRate = 1 + near * 1.5 + flare * 6;
    for (let k = 0; k < 3; k++) {
      const a0 = t * spinRate + (k * Math.PI * 2) / 3;
      ctx.strokeStyle = mix(color, IVORY, 0.3 + near * 0.4);
      ctx.lineWidth = 0.055;
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, R * 0.98, a0, a0 + 1.2);
      ctx.stroke();
      ctx.strokeStyle = rgba(color, 0.6);
      ctx.lineWidth = 0.035;
      const a1 = -t * spinRate * 1.6 + (k * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(goal.x, goal.y, R * 0.62, a1, a1 + 1);
      ctx.stroke();
    }

    // Motes spiral inward.
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = mix(color, IVORY, 0.4);
    for (let i = 0; i < 12; i++) {
      const f = frac(hash(i, 5) + t * (0.35 + near * 0.3));
      const rad = R * (1.7 - f * 1.5);
      const ang = hash(i, 6) * Math.PI * 2 + f * 3.2;
      ctx.globalAlpha = baseAlpha * Math.sin(Math.PI * f) * (0.5 + near * 0.5);
      ctx.beginPath();
      ctx.arc(goal.x + Math.cos(ang) * rad, goal.y + Math.sin(ang) * rad, 0.035 + f * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (goal.maxSpeed != null && near > 0.2) {
      ctx.save();
      ctx.globalAlpha = baseAlpha * near;
      ctx.fillStyle = tooFast ? DANGER : IVORY;
      ctx.font = "600 0.3px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(tooFast ? "SLOW" : "GENTLE", goal.x, goal.y - R - 0.22);
      ctx.restore();
    }
  }

  private previewPath(input: FrameInput): void {
    const pts = input.preview;
    if (pts.length < 2 || input.settings.trajectory === "off") return;
    const { ctx } = this;
    ctx.save();
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (!p) continue;
      const fade = 1 - i / pts.length;
      ctx.globalAlpha = 0.12 + fade * 0.55;
      ctx.fillStyle = p.lost ? DANGER : IVORY;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.035 + fade * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    const end = pts[pts.length - 1];
    if (end?.lost) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = DANGER;
      ctx.lineWidth = 0.045;
      line(ctx, end.x - 0.14, end.y - 0.14, end.x + 0.14, end.y + 0.14);
      line(ctx, end.x + 0.14, end.y - 0.14, end.x - 0.14, end.y + 0.14);
    }
    ctx.restore();
  }

  /** Tethers from the probe to its two strongest sources; dashes flow in the pull direction. */
  private filaments(input: FrameInput): void {
    const { ctx } = this;
    const { state, settings } = input;
    if (state.status !== "play" || this.spawn < 1) return;
    const ranked: { x: number; y: number; mag: number; attract: boolean }[] = [];
    for (let i = 0; i < state.influenceCount; i++) {
      const hit = state.influences[i];
      if (hit?.used) ranked.push(hit);
    }
    ranked.sort((a, b) => b.mag - a.mag);
    const b = state.ball;
    const t = settings.reducedMotion ? 0 : this.clock;
    ctx.save();
    ctx.lineCap = "round";
    for (const hit of ranked.slice(0, 2)) {
      const strength = Math.min(1, hit.mag / 60);
      ctx.strokeStyle = hit.attract ? IVORY : DANGER;
      ctx.globalAlpha = 0.12 + strength * 0.35;
      ctx.lineWidth = 0.025 + strength * 0.03;
      ctx.setLineDash([0.12, 0.16]);
      ctx.lineDashOffset = (hit.attract ? -1 : 1) * t * 1.2;
      line(ctx, b.x, b.y, hit.x, hit.y);
    }
    ctx.restore();
  }

  private debug(input: FrameInput): void {
    const { ctx } = this;
    const b = input.state.ball;
    ctx.strokeStyle = "#9ad7ff";
    ctx.lineWidth = 0.04;
    line(ctx, b.x, b.y, b.x + b.vx * 0.25, b.y + b.vy * 0.25);
    ctx.strokeStyle = "#f2c14e";
    line(ctx, b.x, b.y, b.x + input.state.fx * 0.03, b.y + input.state.fy * 0.03);
  }

  private drawRings(): void {
    const { ctx } = this;
    ctx.save();
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      const rad = r.from + (r.to - r.from) * easeOutCubic(k);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(0.01, rad), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(): void {
    const { ctx } = this;
    ctx.save();
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === "spark") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * (0.5 + a * 0.5);
        ctx.lineCap = "round";
        const tail = 0.035;
        line(ctx, p.x - p.vx * tail, p.y - p.vy * tail, p.x, p.y);
      } else if (p.kind === "shard") {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.beginPath();
        ctx.moveTo(-p.size, -p.size * 0.6);
        ctx.lineTo(p.size, -p.size * 0.2);
        ctx.lineTo(-p.size * 0.2, p.size);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.globalCompositeOperation = p.glow ? "lighter" : "source-over";
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + a * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawFloats(): void {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = "center";
    for (const f of this.floats) {
      const k = 1 - f.life / f.max;
      const pop = k < 0.15 ? easeOutBack(k / 0.15) : 1;
      ctx.globalAlpha = Math.min(1, f.life / 0.35);
      ctx.font = `600 ${0.34 * pop}px Outfit, sans-serif`;
      ctx.lineWidth = 0.08;
      ctx.strokeStyle = "rgba(10,9,8,0.8)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  private drawTrail(input: FrameInput): void {
    if (input.settings.reducedMotion || this.trail.length < 2) return;
    const { ctx } = this;
    const r = input.state.ball.radius;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const n = this.trail.length;
    for (let i = 1; i < n; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      if (!a || !b) continue;
      const k = i / n;
      ctx.strokeStyle = pole(b.p as -1 | 1);
      ctx.globalAlpha = k * k * 0.4;
      ctx.lineWidth = r * 1.5 * k;
      line(ctx, a.x, a.y, b.x, b.y);
    }
    ctx.restore();
  }

  private drawBall(input: FrameInput): void {
    const { ctx } = this;
    const { state, settings, level } = input;
    const b = state.ball;
    const calm = settings.reducedMotion;
    if (this.lostT >= 0) return;
    if (this.spawn < 0) return;

    let x = b.x;
    let y = b.y;
    let size = 1;
    let spin = this.spin;
    if (this.winT >= 0) {
      const k = Math.min(1, this.winT / 0.55);
      const e = easeInCubic(k);
      x = b.x + (level.goal.x - b.x) * easeOutCubic(k);
      y = b.y + (level.goal.y - b.y) * easeOutCubic(k);
      size = 1 - e;
      spin += this.winT * 20;
      if (size <= 0.01) return;
    }
    const appear = easeOutBack(this.spawn);
    size *= appear * (1 + this.flipPop * 0.22);
    const r = b.radius * size;
    const color = this.currentPoleColor();
    const pol = state.effective || b.polarity;

    // Materialize: a converging ring before the probe appears.
    if (this.spawn < 1 && !calm) {
      ctx.save();
      ctx.globalAlpha = 1 - this.spawn;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.arc(x, y, b.radius * (1 + (1 - this.spawn) * 2.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 + this.flipPop * 0.4;
    const gs = r * 3.4;
    ctx.drawImage(glowSprite(pol < 0 ? SOUTH : NORTH), x - gs, y - gs, gs * 2, gs * 2);
    ctx.restore();

    ctx.save();
    ctx.translate(x + 0.07, y + 0.12);
    ctx.scale(1, 0.62);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Squash along the last impact normal; stretch along velocity.
    const speed = Math.hypot(b.vx, b.vy);
    const stretch = calm || this.winT >= 0 ? 0 : Math.min(0.2, speed / 75);
    const sq = calm ? 0 : this.squash * 0.28;
    ctx.save();
    ctx.translate(x, y);
    if (sq > 0.01) {
      const an = Math.atan2(this.squashNY, this.squashNX);
      ctx.rotate(an);
      ctx.scale(1 - sq, 1 + sq * 0.6);
      ctx.rotate(-an);
    }
    if (stretch > 0.01) {
      const av = Math.atan2(b.vy, b.vx);
      ctx.rotate(av);
      ctx.scale(1 + stretch, 1 - stretch * 0.7);
      ctx.rotate(-av);
    }

    const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r);
    body.addColorStop(0, "#fffaf0");
    body.addColorStop(0.35, "#cdbfa8");
    body.addColorStop(0.8, "#5a4f42");
    body.addColorStop(1, "#27221c");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Rolling notches: the ring turns, the glyph stays upright.
    ctx.save();
    ctx.rotate(spin);
    ctx.strokeStyle = "rgba(40,34,27,0.55)";
    ctx.lineWidth = r * 0.07;
    ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      line(ctx, c * r * 0.7, s * r * 0.7, c * r * 0.86, s * r * 0.86);
    }
    ctx.restore();

    const core = ctx.createRadialGradient(0, -r * 0.1, 0, 0, 0, r * 0.56);
    core.addColorStop(0, mix(color.startsWith("#") ? color : pole(pol), IVORY, 0.35));
    core.addColorStop(1, color);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.54, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,17,13,0.45)";
    ctx.lineWidth = r * 0.05;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.38, -r * 0.46, r * 0.2, r * 0.11, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    glyph(ctx, pol, x, y, r * 0.28, false, settings.contrast);
    if (state.effective !== 0 && state.effective !== b.polarity) {
      glyph(ctx, b.polarity, x + r * 0.9, y - r * 0.9, r * 0.2, true, true);
    }
  }

  private drawMark(mark: Mark): void {
    const { ctx } = this;
    ctx.save();
    const a = Math.min(1, mark.life);
    ctx.globalAlpha = a;
    ctx.strokeStyle = DANGER;
    ctx.lineWidth = 0.06;
    ctx.lineCap = "round";
    const s = 0.2;
    line(ctx, mark.x - s, mark.y - s, mark.x + s, mark.y + s);
    line(ctx, mark.x + s, mark.y - s, mark.x - s, mark.y + s);
    ctx.font = "600 0.32px Outfit, sans-serif";
    const w = ctx.measureText(mark.label).width + 0.36;
    const y = mark.y - 0.62;
    ctx.fillStyle = "rgba(20,12,10,0.85)";
    roundRect(ctx, mark.x - w / 2, y - 0.24, w, 0.42, 0.21);
    ctx.fill();
    ctx.strokeStyle = rgba(DANGER, 0.8);
    ctx.lineWidth = 0.025;
    ctx.stroke();
    ctx.fillStyle = IVORY;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark.label, mark.x, y - 0.02);
    ctx.restore();
  }

  /** Screen-space finish: vignette and impact flash. */
  private post(calm: boolean): void {
    const { ctx } = this;
    if (!this.vignette) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(this.cssW / 4));
      c.height = Math.max(1, Math.round(this.cssH / 4));
      const g = c.getContext("2d");
      if (g) {
        const grad = g.createRadialGradient(
          c.width / 2,
          c.height / 2,
          Math.min(c.width, c.height) * 0.35,
          c.width / 2,
          c.height / 2,
          Math.max(c.width, c.height) * 0.75,
        );
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.55)");
        g.fillStyle = grad;
        g.fillRect(0, 0, c.width, c.height);
      }
      this.vignette = c;
    }
    ctx.drawImage(this.vignette, 0, 0, this.cssW, this.cssH);
    if (this.flash > 0.005 && !calm) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = this.flash * 0.5;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.restore();
    }
  }
}

function paintStatic(g: CanvasRenderingContext2D, level: LevelDef, contrast: boolean): void {
  const back = g.createLinearGradient(0, 0, 0, LEVEL_H);
  back.addColorStop(0, "#231e18");
  back.addColorStop(1, "#171410");
  g.fillStyle = back;
  g.fillRect(0, 0, LEVEL_W, LEVEL_H);

  // Drafting grid on the back wall.
  g.lineWidth = 0.015;
  g.strokeStyle = "rgba(227,184,114,0.05)";
  g.beginPath();
  for (let x = 1; x < LEVEL_W; x++) {
    g.moveTo(x, 0);
    g.lineTo(x, LEVEL_H);
  }
  for (let y = 1; y < LEVEL_H; y++) {
    g.moveTo(0, y);
    g.lineTo(LEVEL_W, y);
  }
  g.stroke();
  g.strokeStyle = "rgba(227,184,114,0.09)";
  g.lineWidth = 0.025;
  g.beginPath();
  for (let x = 5; x < LEVEL_W; x += 5) {
    g.moveTo(x, 0);
    g.lineTo(x, LEVEL_H);
  }
  for (let y = 4; y < LEVEL_H; y += 4) {
    g.moveTo(0, y);
    g.lineTo(LEVEL_W, y);
  }
  g.stroke();

  const glow = g.createRadialGradient(LEVEL_W / 2, LEVEL_H * 0.35, 1, LEVEL_W / 2, LEVEL_H * 0.4, LEVEL_W * 0.6);
  glow.addColorStop(0, "rgba(255,220,170,0.06)");
  glow.addColorStop(1, "rgba(0,0,0,0.25)");
  g.fillStyle = glow;
  g.fillRect(0, 0, LEVEL_W, LEVEL_H);

  for (const pit of level.voids ?? []) {
    const grad = g.createLinearGradient(0, pit.y, 0, pit.y + pit.h);
    grad.addColorStop(0, "#0d0b09");
    grad.addColorStop(1, "#000000");
    g.fillStyle = grad;
    g.fillRect(pit.x, pit.y, pit.w, pit.h);
    // Hazard lip along the top of the drop.
    g.save();
    g.beginPath();
    g.rect(pit.x, pit.y, pit.w, 0.12);
    g.clip();
    g.fillStyle = "rgba(255,91,74,0.35)";
    for (let x = pit.x - 0.2; x < pit.x + pit.w; x += 0.4) {
      g.beginPath();
      g.moveTo(x, pit.y + 0.12);
      g.lineTo(x + 0.2, pit.y);
      g.lineTo(x + 0.4, pit.y);
      g.lineTo(x + 0.2, pit.y + 0.12);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // Cast shadows first, so every solid sits on the wall rather than in it.
  const solids = [
    ...(level.boxes ?? []),
    ...(level.platforms ?? []).map((p) => ({ x: p.x, y: p.y, w: p.w, h: 0.28 })),
    ...(level.shields ?? []),
  ];
  g.fillStyle = "rgba(0,0,0,0.32)";
  for (const s of solids) g.fillRect(s.x + 0.1, s.y + 0.14, s.w, s.h);

  for (const box of level.boxes ?? []) metal(g, box.x, box.y, box.w, box.h, contrast);
  for (const plat of level.platforms ?? []) metal(g, plat.x, plat.y, plat.w, 0.28, contrast);

  for (const shield of level.shields ?? []) {
    const grad = g.createLinearGradient(shield.x, 0, shield.x + shield.w, 0);
    grad.addColorStop(0, "#6f6c7c");
    grad.addColorStop(0.5, "#a7a3b4");
    grad.addColorStop(1, "#5c5968");
    g.fillStyle = grad;
    g.fillRect(shield.x, shield.y, shield.w, shield.h);
    g.save();
    g.beginPath();
    g.rect(shield.x, shield.y, shield.w, shield.h);
    g.clip();
    g.strokeStyle = "rgba(28,26,34,0.35)";
    g.lineWidth = 0.05;
    g.beginPath();
    for (let x = shield.x - shield.h; x < shield.x + shield.w; x += 0.26) {
      g.moveTo(x, shield.y);
      g.lineTo(x + shield.h, shield.y + shield.h);
    }
    g.stroke();
    g.restore();
    g.strokeStyle = "rgba(236,232,255,0.55)";
    g.lineWidth = 0.035;
    g.strokeRect(shield.x, shield.y, shield.w, shield.h);
  }

  for (const spike of level.spikes ?? []) {
    const teeth = Math.max(2, Math.floor(spike.w / 0.36));
    const tw = spike.w / teeth;
    for (let i = 0; i < teeth; i++) {
      const x = spike.x + tw * i;
      const grad = g.createLinearGradient(x, 0, x + tw, 0);
      grad.addColorStop(0, "#c8b9a8");
      grad.addColorStop(0.5, "#8c5048");
      grad.addColorStop(1, "#4a2622");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x, spike.y + spike.h);
      g.lineTo(x + tw / 2, spike.y);
      g.lineTo(x + tw, spike.y + spike.h);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(255,120,100,0.5)";
      g.lineWidth = 0.02;
      g.beginPath();
      g.moveTo(x + tw / 2, spike.y);
      g.lineTo(x, spike.y + spike.h);
      g.stroke();
    }
  }
}

/** Bevelled brass-and-iron slab. */
function metal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bright = false): void {
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "#5f5548");
  grad.addColorStop(Math.min(0.5, 0.35 / Math.max(0.35, h)), "#4a4237");
  grad.addColorStop(1, "#2f2922");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = bright ? "rgba(227,184,114,0.7)" : "rgba(227,184,114,0.45)";
  ctx.lineWidth = 0.03;
  ctx.strokeRect(x + 0.015, y + 0.015, w - 0.03, h - 0.03);
  ctx.strokeStyle = "rgba(255,244,220,0.22)";
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(x + 0.04, y + 0.05);
  ctx.lineTo(x + w - 0.04, y + 0.05);
  ctx.stroke();
  if (w > 1.2 && h > 1.2) {
    ctx.fillStyle = "rgba(227,184,114,0.35)";
    for (const [rx, ry] of [
      [x + 0.2, y + 0.2],
      [x + w - 0.2, y + 0.2],
      [x + 0.2, y + h - 0.2],
      [x + w - 0.2, y + h - 0.2],
    ] as const) {
      ctx.beginPath();
      ctx.arc(rx, ry, 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function glyph(
  ctx: CanvasRenderingContext2D,
  polarity: Polarity | -1 | 1,
  x: number,
  y: number,
  r: number,
  filledMark: boolean,
  heavy = false,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = filledMark ? pole(polarity) : IVORY;
  ctx.strokeStyle = filledMark ? pole(polarity) : IVORY;
  ctx.lineWidth = heavy ? r * 0.38 : r * 0.28;
  ctx.lineJoin = "round";
  if (polarity >= 0) {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.9, r * 0.72);
    ctx.lineTo(-r * 0.9, r * 0.72);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function failLabel(reason: FailReason): string {
  if (reason === "spike") return "Barbs";
  if (reason === "beam") return "Beam";
  return "Fell";
}
