export const DICE_SIDES = [4, 6, 8, 10, 12, 20] as const;
export type DiceSides = (typeof DICE_SIDES)[number];

export type DiePhase =
  | 'staging'
  | 'falling'
  | 'settled'
  | 'presenting'
  | 'staged';

export type DieInstance = {
  id: string;
  sides: DiceSides;
  phase: DiePhase;
  /** Resulting face value once settled / presenting / staged after a roll. */
  value: number | null;
};

export type RollPhase = 'idle' | 'rolling' | 'presenting' | 'done';

export const MAX_DICE = 20;
export const HOVER_Y = 2.4;
export const TRAY_HALF_W = 3.2;
export const TRAY_HALF_D = 2.2;
export const TRAY_WALL_H = 1.1;
export const DIE_SCALE = 0.38 * 1.5;

/**
 * Relative overall size vs a d6 for a matched polyhedral set
 * (after meshes are normalized to the same AABB extent).
 * AABB-equal meshes make the d4/d6 look bulky and the d8/d10 skinny,
 * so relatives bias against that.
 */
const SET_SIZE_REL: Record<DiceSides, number> = {
  4: 0.9,
  6: 1,
  8: 1.18,
  10: 1.22,
  12: 1.18,
  20: 1.24,
};

/** World scale so every mesh matches standard set proportions. */
export function dieScale(sides: DiceSides): number {
  return DIE_SCALE * SET_SIZE_REL[sides];
}

export function isDiceSides(n: number): n is DiceSides {
  return (DICE_SIDES as readonly number[]).includes(n);
}
