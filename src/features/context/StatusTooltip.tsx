import { statusMeta } from '../../lib/statusEffects';
import type { StatusEffectId } from '../../lib/types';

interface Props {
  x: number;
  y: number;
  effects: StatusEffectId[];
  visible: boolean;
}

export function StatusTooltip({ x, y, effects, visible }: Props) {
  if (!visible || effects.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute z-30 max-w-xs rounded-lg border border-slate-600 bg-slate-900/95 px-3 py-2 shadow-lg"
      style={{ left: x + 16, top: y - 8 }}
    >
      <ul className="space-y-1 text-sm">
        {effects.map((id) => {
          const m = statusMeta(id);
          return (
            <li key={id} className="flex items-center gap-2">
              {m?.icon ? (
                <img src={m.icon} alt="" className="h-5 w-5 shrink-0 object-contain" draggable={false} />
              ) : (
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: m?.color }}
                />
              )}
              {m?.label ?? id}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
