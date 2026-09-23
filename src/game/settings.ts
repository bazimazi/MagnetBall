import type { TrajectoryMode } from "../core/types";

export interface Settings {
  trajectory: TrajectoryMode;
  shake: "full" | "reduced" | "off";
  particles: "full" | "reduced";
  haptics: boolean;
  reducedMotion: boolean;
  volume: number;
  contrast: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  trajectory: "short",
  shake: "full",
  particles: "full",
  haptics: true,
  reducedMotion: false,
  volume: 0.72,
  contrast: false,
};
