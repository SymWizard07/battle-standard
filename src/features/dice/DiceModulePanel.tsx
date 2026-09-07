import { useMemo, useState } from 'react';
import { DiePreview } from './DiePreview';
import { DiceTrayCanvas } from './DiceTrayCanvas';
import { DICE_SIDES, useDicePoolStore } from './dicePoolStore';
import { MAX_DICE } from './diceTypes';

type Props = {
  /** False when another tab in the same group is active (pause canvas). */
  active?: boolean;
};

export function DiceModulePanel({ active = true }: Props) {
  const dice = useDicePoolStore((s) => s.dice);
  const expression = useDicePoolStore((s) => s.expression);
  const modifier = useDicePoolStore((s) => s.modifier);
  const lastTotal = useDicePoolStore((s) => s.lastTotal);
  const rollPhase = useDicePoolStore((s) => s.rollPhase);
  const addDie = useDicePoolStore((s) => s.addDie);
  const clearDice = useDicePoolStore((s) => s.clearDice);
  const setExpression = useDicePoolStore((s) => s.setExpression);
  const applyExpression = useDicePoolStore((s) => s.applyExpression);
  const beginRoll = useDicePoolStore((s) => s.beginRoll);

  const [exprError, setExprError] = useState(false);

  const breakdown = useMemo(() => {
    if (rollPhase !== 'presenting' && rollPhase !== 'done') return null;
    const vals = dice
      .filter((d) => d.value != null)
      .map((d) => d.value!);
    if (vals.length === 0) return null;
    const body = vals.join(' + ');
    if (modifier === 0) return body;
    const mod = modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`;
    return `${body}${mod}`;
  }, [dice, modifier, rollPhase]);

  const canDrop =
    dice.some((d) => d.phase === 'staging' || d.phase === 'staged') &&
    rollPhase !== 'rolling' &&
    rollPhase !== 'presenting';

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex shrink-0 flex-col gap-2 border-b border-slate-800 px-2 py-2">
        <div className="flex flex-wrap gap-1.5">
          {DICE_SIDES.map((sides) => (
            <button
              key={sides}
              type="button"
              title={`Add d${sides}`}
              disabled={dice.length >= MAX_DICE || rollPhase === 'rolling'}
              onClick={() => addDie(sides)}
              className="flex h-12 w-12 flex-col items-center justify-center overflow-hidden rounded-md border border-slate-700 bg-slate-900/90 hover:border-slate-500 disabled:opacity-40"
            >
              <DiePreview sides={sides} className="h-8 w-8" />
              <span className="text-[10px] leading-none text-slate-400">d{sides}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => clearDice()}
            className="ml-auto rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Clear
          </button>
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const ok = applyExpression();
            setExprError(!ok);
          }}
        >
          <input
            value={expression}
            onChange={(e) => {
              setExprError(false);
              setExpression(e.target.value);
            }}
            placeholder="2d6+3"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm text-slate-100 outline-none focus:border-slate-500"
          />
          <button
            type="submit"
            className="rounded-md border border-slate-600 bg-slate-800 px-2.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
          >
            Set
          </button>
          <button
            type="button"
            disabled={!canDrop}
            onClick={() => beginRoll()}
            className="rounded-md border border-amber-700/60 bg-amber-950/50 px-2.5 text-xs font-medium text-amber-100 hover:bg-amber-900/40 disabled:opacity-40"
          >
            Drop
          </button>
        </form>
        {exprError ? (
          <p className="text-[11px] text-rose-400">
            Use polyset dice only (d4–d20), e.g. 2d6+1d8+3
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">
            Drag dice to fling them into the tray, or press Drop. {dice.length}/{MAX_DICE}
          </p>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <DiceTrayCanvas active={active} />
      </div>

      <div className="flex shrink-0 items-baseline justify-between gap-2 border-t border-slate-800 px-3 py-2">
        <div className="min-w-0 truncate text-xs text-slate-400">
          {breakdown ?? (rollPhase === 'rolling' ? 'Rolling…' : '—')}
        </div>
        <div className="text-lg font-semibold tabular-nums text-slate-50">
          {lastTotal != null ? lastTotal : '·'}
        </div>
      </div>
    </div>
  );
}
