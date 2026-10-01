/** Accept both palette hex values and the RGB values produced by interpolation. */
export function rgb(color: string): [number, number, number] {
  if (color.startsWith("#")) {
    const value = Number.parseInt(color.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return channels?.length === 3 ? [channels[0], channels[1], channels[2]] : [255, 255, 255];
}

export function mix(a: string, b: string, amount: number): string {
  const from = rgb(a);
  const to = rgb(b);
  const t = Math.min(1, Math.max(0, amount));
  return `rgb(${from.map((value, i) => Math.round(value + (to[i] - value) * t)).join(",")})`;
}

export function rgba(color: string, alpha: number): string {
  return `rgba(${rgb(color).join(",")},${alpha})`;
}
