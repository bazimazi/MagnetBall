/** Tunables. Gameplay readability outranks physical realism. */
export const DT = 1 / 120;
export const LEVEL_W = 20;
export const LEVEL_H = 12;
export const GRAVITY = 22;
export const SWITCH_DELAY = 0.07;
export const CHAIN_WINDOW = 1.05;
export const BALL_R = 0.44;

export const S = {
  weak: 34,
  medium: 62,
  strong: 100,
  extreme: 145,
} as const;

export const R = {
  short: 2.6,
  medium: 4.6,
  long: 7.4,
  reach: 9.2,
} as const;
