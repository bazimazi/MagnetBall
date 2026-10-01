import { rgba } from "./color";

const TAU = Math.PI * 2;
const GOLD = "#dec396";
const NORTH = "#ff9955";
const SOUTH = "#5ee8dc";

function circle(g: CanvasRenderingContext2D, r: number): void {
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
}

/** A procedural kinetic sculpture for the title. No downloaded textures or fonts required. */
export function drawObservatory(g: CanvasRenderingContext2D, width: number, height: number, time: number, reduced: boolean): void {
  const narrow = width < 760;
  const size = Math.min(narrow ? width * 0.32 : width * 0.205, height * (narrow ? 0.16 : 0.3));
  const cx = width * (narrow ? 0.5 : 0.735);
  const cy = height * (narrow ? 0.245 : 0.48);
  const t = reduced ? 0 : time;
  g.save();
  g.translate(cx, cy);
  g.scale(size, size);

  // Broad, colored light spills behind the instrument.
  for (const [x, color] of [[-0.65, NORTH], [0.65, SOUTH]] as const) {
    const glow = g.createRadialGradient(x, 0, 0, x, 0, 1.55);
    glow.addColorStop(0, rgba(color, 0.13));
    glow.addColorStop(1, rgba(color, 0));
    g.fillStyle = glow;
    g.fillRect(-2.3, -2.3, 4.6, 4.6);
  }

  // Stationary engraved dial with hairline divisions and a slowly moving pointer.
  g.strokeStyle = rgba(GOLD, 0.16);
  g.lineWidth = 0.003;
  for (const r of [0.83, 1.05, 1.09, 1.25]) { circle(g, r); g.stroke(); }
  for (let i = 0; i < 120; i++) {
    const a = i / 120 * TAU;
    const major = i % 10 === 0;
    g.strokeStyle = rgba(GOLD, major ? 0.6 : 0.22);
    g.beginPath();
    g.moveTo(Math.cos(a) * 1.09, Math.sin(a) * 1.09);
    g.lineTo(Math.cos(a) * (major ? 1.15 : 1.115), Math.sin(a) * (major ? 1.15 : 1.115));
    g.stroke();
  }
  g.font = "0.038px monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = rgba(GOLD, 0.55);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    g.fillText(String(i * 45).padStart(3, "0"), Math.cos(a) * 1.2, Math.sin(a) * 1.2);
  }

  // Counter-rotating gimbals; elliptical projection gives the apparatus depth.
  for (let i = 0; i < 3; i++) {
    g.save();
    g.rotate(i * Math.PI / 3 + t * (i % 2 ? -0.045 : 0.035));
    g.scale(1, 0.4 + i * 0.07);
    g.strokeStyle = "#080f13";
    g.lineWidth = 0.043;
    circle(g, 0.94); g.stroke();
    const metal = g.createLinearGradient(-1, -1, 1, 1);
    metal.addColorStop(0, "#665640");
    metal.addColorStop(0.35, "#f2d5a1");
    metal.addColorStop(0.5, "#736852");
    metal.addColorStop(1, "#263837");
    g.strokeStyle = metal;
    g.lineWidth = 0.018;
    circle(g, 0.94); g.stroke();
    g.restore();
  }

  // Magnetic lines meet at the suspended core. Small photons travel along each line.
  for (let side = -1; side <= 1; side += 2) {
    const color = side < 0 ? NORTH : SOUTH;
    for (let i = -3; i <= 3; i++) {
      const bend = i * 0.145;
      g.strokeStyle = rgba(color, 0.12 + (3 - Math.abs(i)) * 0.025);
      g.lineWidth = 0.003;
      g.beginPath();
      g.moveTo(side * 0.88, 0);
      g.bezierCurveTo(side * 0.55, bend, side * 0.2, bend, 0, 0);
      g.stroke();
      const u = (t * 0.23 + (i + 3) / 7) % 1;
      const v = 1 - u;
      const x = side * (v ** 3 * 0.88 + 3 * v * v * u * 0.55 + 3 * v * u * u * 0.2);
      const y = 3 * v * u * bend;
      g.fillStyle = rgba(color, Math.sin(u * Math.PI) * 0.85);
      g.beginPath(); g.arc(x, y, 0.008, 0, TAU); g.fill();
    }
    g.save();
    g.translate(side * 0.9, 0);
    g.rotate(side * Math.PI / 2);
    const housing = g.createLinearGradient(-0.13, 0, 0.13, 0);
    housing.addColorStop(0, "#17272c"); housing.addColorStop(0.45, "#6d736a"); housing.addColorStop(1, "#15252b");
    g.fillStyle = housing;
    g.fillRect(-0.13, -0.09, 0.26, 0.18);
    g.strokeStyle = rgba(GOLD, 0.55); g.lineWidth = 0.005;
    g.strokeRect(-0.13, -0.09, 0.26, 0.18);
    g.strokeStyle = color; g.lineWidth = 0.016;
    g.beginPath(); g.moveTo(-0.13, -0.09); g.lineTo(0.13, -0.09); g.stroke();
    g.restore();
  }

  // Porcelain and titanium probe with two luminous hemispheres under glass.
  g.save();
  g.translate(0, Math.sin(t * 1.2) * 0.035);
  const halo = g.createRadialGradient(0, 0, 0.1, 0, 0, 0.6);
  halo.addColorStop(0, "rgba(191,240,222,0.2)"); halo.addColorStop(1, "rgba(191,240,222,0)");
  g.fillStyle = halo; circle(g, 0.6); g.fill();
  const body = g.createRadialGradient(-0.1, -0.12, 0, 0.02, 0.03, 0.28);
  body.addColorStop(0, "#fff9dd"); body.addColorStop(0.33, "#d6ded2"); body.addColorStop(0.62, "#6a817e"); body.addColorStop(0.85, "#1d323c"); body.addColorStop(1, "#88a89d");
  g.fillStyle = body; circle(g, 0.26); g.fill();
  g.strokeStyle = rgba(GOLD, 0.65); g.lineWidth = 0.005; g.stroke();
  g.save(); g.rotate(t * 0.17 - 0.35);
  for (const [start, color] of [[Math.PI / 2, NORTH], [-Math.PI / 2, SOUTH]] as const) {
    const lens = g.createRadialGradient(-0.04, -0.05, 0, 0, 0, 0.18);
    lens.addColorStop(0, "#fff7da"); lens.addColorStop(0.5, color); lens.addColorStop(1, rgba(color, 0.5));
    g.fillStyle = lens; g.beginPath(); g.arc(0, 0, 0.177, start, start + Math.PI); g.closePath(); g.fill();
  }
  g.strokeStyle = "#12242a"; g.lineWidth = 0.019;
  g.beginPath(); g.moveTo(0, -0.177); g.lineTo(0, 0.177); g.stroke();
  g.restore();
  const glass = g.createLinearGradient(0, -0.2, 0, 0.1);
  glass.addColorStop(0, "rgba(255,255,255,0.7)"); glass.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glass; g.beginPath(); g.ellipse(-0.035, -0.105, 0.14, 0.065, -0.35, 0, TAU); g.fill();
  g.restore();

  // Satellites traverse the outer instrument ring.
  for (let i = 0; i < 2; i++) {
    const a = t * 0.22 + i * Math.PI + 0.7;
    const color = i ? SOUTH : NORTH;
    const x = Math.cos(a) * 1.05, y = Math.sin(a) * 1.05;
    g.fillStyle = color; g.beginPath(); g.arc(x, y, 0.013, 0, TAU); g.fill();
    g.strokeStyle = rgba(color, 0.55); g.lineWidth = 0.004;
    g.beginPath(); g.arc(0, 0, 1.05, a - 0.32, a); g.stroke();
  }
  g.restore();
}
