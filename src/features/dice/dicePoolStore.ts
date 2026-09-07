import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { parseDiceTrayExpression } from './diceExpression';
import {
  DICE_SIDES,
  MAX_DICE,
  type DiceSides,
  type DieInstance,
  type RollPhase,
} from './diceTypes';

export type FlingVec = {
  x: number;
  y: number;
  z: number;
  /** Optional yaw rate from cursor swirl at release (rad/s). */
  wy?: number;
};

type DicePoolState = {
  dice: DieInstance[];
  modifier: number;
  expression: string;
  rollPhase: RollPhase;
  /** Increments on every roll so physics dies always relaunch. */
  rollId: number;
  /** Per-die fling velocities for the current roll (cleared when roll completes). */
  flings: Record<string, FlingVec>;
  /** Die ids in the order they settled for the current reveal stagger. */
  settleOrder: string[];
  /** Sum of settled values + modifier after a completed roll. */
  lastTotal: number | null;
  reducedMotion: boolean;

  setExpression: (v: string) => void;
  addDie: (sides: DiceSides) => void;
  clearDice: () => void;
  applyExpression: () => boolean;
  setRollPhase: (phase: RollPhase) => void;
  setDiePhase: (id: string, phase: DieInstance['phase'], value?: number | null) => void;
  /** Start a physics roll; optional per-die fling (e.g. from cursor release). */
  beginRoll: (flings?: Record<string, FlingVec>) => void;
  applySettledValues: (
    values: Record<string, number>,
    settleOrder?: string[],
  ) => void;
  markPresented: () => void;
  setLastTotal: (total: number | null) => void;
  setReducedMotion: (v: boolean) => void;
};

function canStartRoll(phase: DieInstance['phase']): boolean {
  return phase === 'staging' || phase === 'staged';
}

export const useDicePoolStore = create<DicePoolState>((set, get) => ({
  dice: [],
  modifier: 0,
  expression: '',
  rollPhase: 'idle',
  rollId: 0,
  flings: {},
  settleOrder: [],
  lastTotal: null,
  reducedMotion:
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,

  setExpression: (v) => set({ expression: v }),

  addDie: (sides) => {
    const { dice, rollPhase } = get();
    if (dice.length >= MAX_DICE) return;
    if (rollPhase === 'rolling' || rollPhase === 'presenting') return;
    set({
      dice: [
        ...dice,
        { id: nanoid(8), sides, phase: 'staging', value: null },
      ],
      rollPhase: 'idle',
      lastTotal: null,
    });
  },

  clearDice: () =>
    set({
      dice: [],
      modifier: 0,
      expression: '',
      rollPhase: 'idle',
      rollId: 0,
      flings: {},
      settleOrder: [],
      lastTotal: null,
    }),

  applyExpression: () => {
    const parsed = parseDiceTrayExpression(get().expression);
    if (!parsed) return false;
    if (parsed.dice.length === 0 && parsed.modifier === 0) return false;
    const capped = parsed.dice.slice(0, MAX_DICE);
    set({
      dice: capped.map((sides) => ({
        id: nanoid(8),
        sides,
        phase: 'staging' as const,
        value: null,
      })),
      modifier: parsed.modifier,
      rollPhase: 'idle',
      flings: {},
      settleOrder: [],
      lastTotal: null,
    });
    return true;
  },

  setRollPhase: (rollPhase) => set({ rollPhase }),

  setDiePhase: (id, phase, value) =>
    set((s) => ({
      dice: s.dice.map((d) =>
        d.id === id
          ? { ...d, phase, ...(value !== undefined ? { value } : {}) }
          : d,
      ),
    })),

  beginRoll: (flings = {}) =>
    set((s) => {
      if (s.rollPhase === 'rolling' || s.rollPhase === 'presenting') return s;
      const hasRollable = s.dice.some((d) => canStartRoll(d.phase));
      if (!hasRollable) return s;
      return {
        rollPhase: 'rolling' as const,
        lastTotal: null,
        rollId: s.rollId + 1,
        flings,
        settleOrder: [],
        dice: s.dice.map((d) =>
          canStartRoll(d.phase)
            ? { ...d, phase: 'falling' as const, value: null }
            : d,
        ),
      };
    }),

  applySettledValues: (values, settleOrder) =>
    set((s) => {
      const dice = s.dice.map((d) =>
        values[d.id] != null
          ? { ...d, phase: 'presenting' as const, value: values[d.id]! }
          : d,
      );
      const sum = dice.reduce((acc, d) => acc + (d.value ?? 0), 0);
      const order =
        settleOrder && settleOrder.length > 0
          ? settleOrder
          : Object.keys(values);
      return {
        dice,
        rollPhase: 'presenting' as const,
        flings: {},
        settleOrder: order,
        lastTotal: sum + s.modifier,
      };
    }),

  markPresented: () => {
    const { dice, modifier, lastTotal } = get();
    const sum = dice.reduce((acc, d) => acc + (d.value ?? 0), 0);
    set({
      dice: dice.map((d) =>
        d.value != null ? { ...d, phase: 'staged' } : d,
      ),
      rollPhase: 'done',
      lastTotal: lastTotal ?? sum + modifier,
      flings: {},
    });
  },

  setLastTotal: (lastTotal) => set({ lastTotal }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
}));

export { DICE_SIDES };
