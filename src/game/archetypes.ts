import type { ArchetypeId } from "../core/types";
import { BALL_R } from "../physics/constants";

export interface Archetype {
  id: ArchetypeId;
  label: string;
  blurb: string;
  mass: number;
  susceptibility: number;
  restitution: number;
  friction: number;
  maxSpeed: number;
  radius: number;
}

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  probe: {
    id: "probe",
    label: "Probe",
    blurb: "The issued core. Balanced, and honest about every force.",
    mass: 1,
    susceptibility: 1,
    restitution: 0.4,
    friction: 0.22,
    maxSpeed: 13,
    radius: BALL_R,
  },
  wisp: {
    id: "wisp",
    label: "Wisp",
    blurb: "A lighter core. Weak fields redraw its path. It keeps less of what it is given.",
    mass: 0.62,
    susceptibility: 1.28,
    restitution: 0.32,
    friction: 0.16,
    maxSpeed: 11.5,
    radius: 0.36,
  },
  slug: {
    id: "slug",
    label: "Slug",
    blurb: "Dense. Gentle fields barely turn it. What it gains, it keeps.",
    mass: 2.15,
    susceptibility: 0.7,
    restitution: 0.22,
    friction: 0.34,
    maxSpeed: 10.5,
    radius: 0.52,
  },
  reed: {
    id: "reed",
    label: "Reed",
    blurb: "Returns almost everything it strikes. Lively, and a little unruly.",
    mass: 0.92,
    susceptibility: 0.96,
    restitution: 0.86,
    friction: 0.08,
    maxSpeed: 14,
    radius: 0.42,
  },
};

export function archetypeOf(id: ArchetypeId | undefined): Archetype {
  return ARCHETYPES[id ?? "probe"];
}
