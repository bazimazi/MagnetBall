import type { FailReason, LevelDef, Polarity, SimEvent, SimState } from "../core/types";
import { LEVEL_H, LEVEL_W } from "../physics/constants";
import { cycledPolarity, faceFrame, laserActive, poseOf } from "../physics/geom";
import type { Settings } from "../game/settings";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
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
}

const NORTH = "#e08a3c";
const SOUTH = "#2fbfb3";
const IVORY = "#f4efe6";
const BRASS = "#d7b07a";
const DANGER = "#d15a45";

function pole(p: Polarity | -1 | 1): string {
  return p < 0 ? SOUTH : NORTH;
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
    image.data[i + 3] = 46;
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
  private trauma = 0;
  private squash = 0;
  private trail: { x: number; y: number }[] = [];
  private noise: CanvasPattern | null = null;
  private trailTick = 0;

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
  }

  clearTrail(): void {
    this.trail.length = 0;
  }

  ingest(events: SimEvent[], settings: Settings): void {
    const quiet = settings.particles === "reduced" || settings.reducedMotion;
    const cap = quiet ? 48 : 160;
    for (const event of events) {
      if (event.type === "bounce") {
        this.squash = Math.min(1, event.speed / 9);
        if (settings.shake !== "off" && !settings.reducedMotion) {
          const scale = settings.shake === "reduced" ? 0.35 : 1;
          this.trauma = Math.min(1, this.trauma + (event.speed / 48) * scale);
        }
        if (!quiet) this.burst(event.x, event.y, event.nx, event.ny, 7, IVORY, event.speed);
      } else if (event.type === "switch") {
        this.burst(0, 0, 0, 0, quiet ? 4 : 10, pole(event.polarity), 4, true);
      } else if (event.type === "win" || event.type === "chime") {
        this.burst(0, 0, 0, 0, quiet ? 6 : 16, BRASS, 5, true);
      } else if (event.type === "collect") {
        this.burst(0, 0, 0, 0, 6, BRASS, 3, true);
      }
    }
    if (this.particles.length > cap) this.particles.splice(0, this.particles.length - cap);
  }

  /** `atBall` bursts are positioned on the next draw from the live ball. */
  private pending: { color: string; n: number; speed: number }[] = [];

  private burst(
    x: number,
    y: number,
    nx: number,
    ny: number,
    n: number,
    color: string,
    speed: number,
    atBall = false,
  ): void {
    if (atBall) {
      this.pending.push({ color, n, speed });
      return;
    }
    this.spawn(x, y, nx, ny, n, color, speed);
  }

  private spawn(x: number, y: number, nx: number, ny: number, n: number, color: string, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const kick = 0.4 + Math.random() * (0.8 + speed * 0.15);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * kick + nx * speed * 0.15,
        vy: Math.sin(a) * kick + ny * speed * 0.15,
        life: 0.28 + Math.random() * 0.28,
        max: 0.5,
        color,
        size: 0.04 + Math.random() * 0.06,
      });
    }
  }

  draw(input: FrameInput, dt: number): void {
    const { ctx } = this;
    const { state } = input;
    const ball = state.ball;
    for (const item of this.pending) this.spawn(ball.x, ball.y, 0, 0, item.n, item.color, item.speed);
    this.pending.length = 0;

    this.squash = Math.max(0, this.squash - dt * 2.4);
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 6 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    if (!input.settings.reducedMotion && state.status === "play") {
      this.trailTick += dt;
      if (this.trailTick > 0.03) {
        this.trail.push({ x: ball.x, y: ball.y });
        if (this.trail.length > 16) this.trail.shift();
        this.trailTick = 0;
      }
    }

    const shakeAmp = this.trauma * this.trauma * 7;
    const sx = Math.sin(state.time * 47) * shakeAmp;
    const sy = Math.cos(state.time * 38) * shakeAmp;
    const pad = 0.42;
    const scale = Math.min(this.cssW / (LEVEL_W + pad * 2), this.cssH / (LEVEL_H + pad * 2));
    const ox = (this.cssW - LEVEL_W * scale) / 2 + sx;
    const oy = (this.cssH - LEVEL_H * scale) / 2 + sy;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const sky = ctx.createRadialGradient(
      this.cssW * 0.5,
      this.cssH * 0.45,
      20,
      this.cssW * 0.5,
      this.cssH * 0.5,
      Math.max(this.cssW, this.cssH) * 0.7,
    );
    sky.addColorStop(0, "#3a3328");
    sky.addColorStop(1, "#14120f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (this.noise) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = this.noise;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    this.chamber(input);
    this.fields(input);
    this.architecture(input);
    this.devices(input);
    this.goal(input);
    this.preview(input);
    this.filaments(input);
    if (input.debug) this.debug(input);
    for (const dot of input.failDots) {
      ctx.fillStyle = "rgba(209,90,69,0.45)";
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawParticles();
    this.drawTrail(input);
    this.drawBall(input);
    if (input.mark && input.mark.life > 0) this.drawMark(input.mark);
    if (state.chain >= 3 && state.chainWindow > 0.2 && !input.settings.reducedMotion) {
      ctx.fillStyle = BRASS;
      ctx.font = "0.42px Fraunces, Palatino, serif";
      ctx.textAlign = "center";
      ctx.fillText(String(state.chain), ball.x, ball.y - ball.radius - 0.38);
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(215,176,122,0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, LEVEL_W * scale - 1, LEVEL_H * scale - 1);
  }

  private chamber(input: FrameInput): void {
    const { ctx } = this;
    ctx.fillStyle = "#2c2822";
    ctx.fillRect(0, 0, LEVEL_W, LEVEL_H);
    ctx.fillStyle = "#070605";
    for (const pit of input.level.voids ?? []) ctx.fillRect(pit.x, pit.y, pit.w, pit.h);
  }

  private fields(input: FrameInput): void {
    const { ctx } = this;
    const { level, state } = input;
    const active = new Set<string>();
    for (let i = 0; i < state.influenceCount; i++) {
      const hit = state.influences[i];
      if (hit?.used) active.add(hit.id);
    }
    for (const plate of level.plates ?? []) {
      const pose = poseOf(plate.x, plate.y, plate.motion, state.time);
      const pol = cycledPolarity(plate.polarity, plate.cycle, state.time);
      const face = faceFrame(plate.face, pose.x, pose.y, plate.w, plate.h);
      const attract = state.effective * pol < 0;
      const hot = active.has(plate.id);
      const color = pole(pol);
      ctx.save();
      ctx.globalAlpha = hot ? 0.34 : 0.14;
      ctx.beginPath();
      ctx.moveTo(face.ax, face.ay);
      ctx.lineTo(face.bx, face.by);
      ctx.lineTo(face.bx + face.nx * plate.range, face.by + face.ny * plate.range);
      ctx.lineTo(face.ax + face.nx * plate.range, face.ay + face.ny * plate.range);
      ctx.closePath();
      const grad = ctx.createLinearGradient(
        face.ax,
        face.ay,
        face.ax + face.nx * plate.range,
        face.ay + face.ny * plate.range,
      );
      grad.addColorStop(0, color);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = hot ? 1 : 0.62;
      ctx.lineWidth = input.settings.contrast ? 0.07 : 0.045;
      ctx.lineCap = "round";
      const ticks = 6;
      const len = 0.32 + Math.min(0.45, plate.strength / 280);
      ctx.beginPath();
      for (let i = 0; i < ticks; i++) {
        const t = (i + 0.5) / ticks;
        const x = face.ax + (face.bx - face.ax) * t;
        const y = face.ay + (face.by - face.ay) * t;
        const near = 0.12;
        const x1 = x + face.nx * (attract ? len : near);
        const y1 = y + face.ny * (attract ? len : near);
        const x2 = x + face.nx * (attract ? near : len);
        const y2 = y + face.ny * (attract ? near : len);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const mag = Math.hypot(dx, dy) || 1;
        const ux = dx / mag;
        const uy = dy / mag;
        const ah = 0.14;
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux * ah - uy * ah * 0.55, y2 - uy * ah + ux * ah * 0.55);
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux * ah + uy * ah * 0.55, y2 - uy * ah - ux * ah * 0.55);
      }
      ctx.stroke();
      ctx.restore();
    }

    for (const orb of level.orbs ?? []) {
      const pose = poseOf(orb.x, orb.y, orb.motion, state.time);
      const pol = cycledPolarity(orb.polarity, orb.cycle, state.time);
      const hot = active.has(orb.id);
      const grad = ctx.createRadialGradient(pose.x, pose.y, (orb.r ?? 0.48), pose.x, pose.y, orb.range);
      grad.addColorStop(0, pole(pol));
      grad.addColorStop(1, "transparent");
      ctx.save();
      ctx.globalAlpha = hot ? 0.2 : 0.07;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pose.x, pose.y, orb.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private architecture(input: FrameInput): void {
    const { ctx } = this;
    const { level, state } = input;
    for (const box of level.boxes ?? []) this.metal(box.x, box.y, box.w, box.h);
    for (const plat of level.platforms ?? []) this.metal(plat.x, plat.y, plat.w, 0.28);
    for (const plate of level.plates ?? []) {
      if (plate.solid === false) continue;
      const pose = poseOf(plate.x, plate.y, plate.motion, state.time);
      this.metal(pose.x, pose.y, plate.w, plate.h);
      const pol = cycledPolarity(plate.polarity, plate.cycle, state.time);
      const face = faceFrame(plate.face, pose.x, pose.y, plate.w, plate.h);
      ctx.strokeStyle = pole(pol);
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = input.settings.contrast ? 0.09 : 0.06;
      ctx.beginPath();
      ctx.moveTo(face.ax, face.ay);
      ctx.lineTo(face.bx, face.by);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const marks = Math.max(3, Math.round((Math.hypot(face.bx - face.ax, face.by - face.ay) / 1.1)));
      ctx.fillStyle = pole(pol);
      ctx.strokeStyle = pole(pol);
      for (let i = 0; i < marks; i++) {
        const t = (i + 0.5) / marks;
        const x = face.ax + (face.bx - face.ax) * t - face.nx * 0.22;
        const y = face.ay + (face.by - face.ay) * t - face.ny * 0.22;
        glyph(ctx, pol, x, y, 0.11, true);
      }
    }
    for (const shield of level.shields ?? []) {
      ctx.fillStyle = "#8d8a96";
      ctx.fillRect(shield.x, shield.y, shield.w, shield.h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(shield.x, shield.y, shield.w, shield.h);
      ctx.clip();
      ctx.strokeStyle = "rgba(28,26,34,0.45)";
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      for (let x = shield.x - shield.h; x < shield.x + shield.w; x += 0.28) {
        ctx.moveTo(x, shield.y);
        ctx.lineTo(x + shield.h, shield.y + shield.h);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "rgba(244,239,230,0.35)";
      ctx.strokeRect(shield.x, shield.y, shield.w, shield.h);
    }
  }

  private metal(x: number, y: number, w: number, h: number): void {
    const { ctx } = this;
    ctx.fillStyle = "#4e463c";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(215,176,122,0.55)";
    ctx.lineWidth = 0.035;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = "rgba(244,239,230,0.08)";
    ctx.beginPath();
    ctx.moveTo(x, y + 0.06);
    ctx.lineTo(x + w, y + 0.06);
    ctx.stroke();
  }

  private devices(input: FrameInput): void {
    const { ctx } = this;
    const { level, state } = input;
    for (const zone of level.zones ?? []) {
      ctx.save();
      ctx.fillStyle = zone.kind === "invert" ? "rgba(215,176,122,0.07)" : "rgba(47,191,179,0.07)";
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      ctx.strokeStyle = "rgba(215,176,122,0.45)";
      ctx.lineWidth = 0.04;
      ctx.setLineDash([0.18, 0.14]);
      ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
      ctx.setLineDash([]);
      ctx.restore();
    }
    for (const spike of level.spikes ?? []) {
      ctx.fillStyle = "#6e332c";
      const teeth = Math.max(2, Math.floor(spike.w / 0.38));
      for (let i = 0; i < teeth; i++) {
        const x = spike.x + (spike.w / teeth) * i;
        ctx.beginPath();
        ctx.moveTo(x, spike.y + spike.h);
        ctx.lineTo(x + spike.w / teeth / 2, spike.y);
        ctx.lineTo(x + spike.w / teeth, spike.y + spike.h);
        ctx.fill();
      }
    }
    for (const beam of level.lasers ?? []) {
      if (!laserActive(beam.period, beam.phase, state.time)) continue;
      ctx.save();
      ctx.strokeStyle = "rgba(209,90,69,0.35)";
      ctx.lineWidth = 0.22;
      ctx.beginPath();
      ctx.moveTo(beam.x1, beam.y1);
      ctx.lineTo(beam.x2, beam.y2);
      ctx.stroke();
      ctx.strokeStyle = "#f2d2c8";
      ctx.lineWidth = 0.045;
      ctx.stroke();
      ctx.restore();
    }
    for (const rail of level.rails ?? []) {
      const a = poseOf(rail.x1, rail.y1, rail.motion, state.time);
      const b = poseOf(rail.x2, rail.y2, rail.motion, state.time);
      const pol = cycledPolarity(rail.polarity, rail.cycle, state.time);
      ctx.strokeStyle = pole(pol);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 0.18;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 0.045;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const orb of level.orbs ?? []) {
      const pose = poseOf(orb.x, orb.y, orb.motion, state.time);
      const pol = cycledPolarity(orb.polarity, orb.cycle, state.time);
      const r = orb.r ?? 0.48;
      const grad = ctx.createRadialGradient(pose.x - r * 0.3, pose.y - r * 0.35, r * 0.1, pose.x, pose.y, r);
      grad.addColorStop(0, "#6b6256");
      grad.addColorStop(1, "#2a261f");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pose.x, pose.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pole(pol);
      ctx.lineWidth = 0.06;
      ctx.stroke();
      glyph(ctx, pol, pose.x, pose.y, r * 0.42, false);
    }
    for (const ring of level.rings ?? []) {
      const pose = poseOf(ring.x, ring.y, ring.motion, state.time);
      const pol = cycledPolarity(ring.polarity, ring.cycle, state.time);
      ctx.strokeStyle = pole(pol);
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.arc(pose.x, pose.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const [index, shard] of (level.fragments ?? []).entries()) {
      if (state.got[index]) continue;
      const bob = input.settings.reducedMotion ? 0 : Math.sin(state.time * 3 + index) * 0.06;
      ctx.save();
      ctx.translate(shard.x, shard.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = BRASS;
      ctx.fillRect(-0.12, -0.12, 0.24, 0.24);
      ctx.restore();
    }
  }

  private goal(input: FrameInput): void {
    const { ctx } = this;
    const { level, state } = input;
    const goal = level.goal;
    const r = goal.r ?? 0.62;
    const dist = Math.hypot(state.ball.x - goal.x, state.ball.y - goal.y);
    const speed = Math.hypot(state.ball.vx, state.ball.vy);
    const near = dist < r * 2.4;
    const tooFast = goal.maxSpeed != null && speed > goal.maxSpeed;
    const color = near && tooFast ? DANGER : near ? "#f7f1e4" : BRASS;
    const pulse = input.settings.reducedMotion ? 0 : Math.sin(state.time * 2.4) * 0.04;
    ctx.strokeStyle = color;
    ctx.globalAlpha = state.status === "won" ? 1 : 0.85;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, r + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private preview(input: FrameInput): void {
    const pts = input.preview;
    if (pts.length < 2 || input.settings.trajectory === "off") return;
    const { ctx } = this;
    ctx.save();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p) continue;
      const fade = 1 - i / pts.length;
      ctx.globalAlpha = 0.15 + fade * 0.55;
      ctx.fillStyle = p.lost ? DANGER : IVORY;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private filaments(input: FrameInput): void {
    const { ctx, } = this;
    const { state } = input;
    const ranked: { x: number; y: number; mag: number; attract: boolean }[] = [];
    for (let i = 0; i < state.influenceCount; i++) {
      const hit = state.influences[i];
      if (!hit?.used) continue;
      ranked.push(hit);
    }
    ranked.sort((a, b) => b.mag - a.mag);
    const top = ranked.slice(0, 2);
    ctx.save();
    ctx.lineWidth = 0.03;
    for (const hit of top) {
      ctx.strokeStyle = hit.attract ? "rgba(244,239,230,0.45)" : "rgba(209,90,69,0.35)";
      ctx.beginPath();
      ctx.moveTo(state.ball.x, state.ball.y);
      ctx.lineTo(hit.x, hit.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private debug(input: FrameInput): void {
    const { ctx } = this;
    const b = input.state.ball;
    ctx.strokeStyle = "#9ad7ff";
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.vx * 0.25, b.y + b.vy * 0.25);
    ctx.stroke();
    ctx.strokeStyle = "#f2c14e";
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + input.state.fx * 0.03, b.y + input.state.fy * 0.03);
    ctx.stroke();
  }

  private drawParticles(): void {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawTrail(input: FrameInput): void {
    if (input.settings.reducedMotion || this.trail.length < 2) return;
    const { ctx } = this;
    const color = pole(input.state.effective);
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      if (!a || !b) continue;
      ctx.globalAlpha = (i / this.trail.length) * 0.35;
      ctx.lineWidth = 0.05 + (i / this.trail.length) * 0.08;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawBall(input: FrameInput): void {
    const { ctx } = this;
    const b = input.state.ball;
    const speed = Math.hypot(b.vx, b.vy);
    const stretch = input.settings.reducedMotion ? 0 : Math.min(0.22, speed / 70) + this.squash * 0.12;
    const angle = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x + 0.08, b.y + 0.1);
    ctx.scale(1, 0.55);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(0, 0, b.radius * 0.86, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);
    ctx.scale(1 + stretch, 1 - stretch * 0.75);
    const grad = ctx.createRadialGradient(-b.radius * 0.35, -b.radius * 0.4, b.radius * 0.1, 0, 0, b.radius);
    grad.addColorStop(0, "#f7f1e6");
    grad.addColorStop(0.45, "#b7a48a");
    grad.addColorStop(1, "#3a332b");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pole(input.state.effective);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, b.radius * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    glyph(ctx, input.state.effective, b.x, b.y, b.radius * 0.28, false, input.settings.contrast);
    if (input.state.effective !== b.polarity) {
      glyph(ctx, b.polarity, b.x + b.radius * 0.85, b.y - b.radius * 0.85, b.radius * 0.16, false, true);
    }
  }

  private drawMark(mark: Mark): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = Math.min(1, mark.life);
    ctx.strokeStyle = DANGER;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(mark.x - 0.18, mark.y - 0.18);
    ctx.lineTo(mark.x + 0.18, mark.y + 0.18);
    ctx.moveTo(mark.x + 0.18, mark.y - 0.18);
    ctx.lineTo(mark.x - 0.18, mark.y + 0.18);
    ctx.stroke();
    ctx.fillStyle = IVORY;
    ctx.font = "0.36px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(mark.label, mark.x, mark.y - 0.32);
    ctx.restore();
  }
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
