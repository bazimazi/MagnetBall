import type { LevelDef } from "../core/types";

/** True room silhouettes, so selecting a chamber also previews its spatial puzzle. */
export function blueprint(level: LevelDef | undefined): string {
  if (!level) return "";
  const rects = (level.boxes ?? []).map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`).join("");
  const platforms = (level.platforms ?? []).map(p => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height=".22"/>`).join("");
  const plates = (level.plates ?? []).map(p => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.polarity > 0 ? "#ff9955" : "#5ee8dc"}" fill-opacity=".6" stroke="${p.polarity > 0 ? "#ff9955" : "#5ee8dc"}"/>`).join("");
  const orbs = (level.orbs ?? []).map(o => `<circle cx="${o.x}" cy="${o.y}" r="${o.r ?? 0.48}" fill="${o.polarity > 0 ? "#ff9955" : "#5ee8dc"}"/>`).join("");
  return `<svg class="blueprint" viewBox="-.3 -.3 20.6 12.6" aria-hidden="true" fill="none">
    <g fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-opacity=".5" stroke-width=".07">${rects}${platforms}${plates}</g>
    ${orbs}<circle cx="${level.goal.x}" cy="${level.goal.y}" r="${level.goal.r ?? 0.62}" stroke="#dec396" stroke-width=".12"/>
    <circle cx="${level.ball.x}" cy="${level.ball.y}" r=".25" fill="#edf6ed"/>
  </svg>`;
}
