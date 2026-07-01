import type { MouseEvent, PointerEvent, TouchEvent } from 'react';
import { GRID_SNAP_CYCLE, showsGridSnapControl } from '../lib/gridSnap';
import { seesAsPlayer, useStore } from '../store/useStore';

function stopBubble(e: MouseEvent | PointerEvent | TouchEvent) {
  e.stopPropagation();
}

const SNAP_LABELS: Record<(typeof GRID_SNAP_CYCLE)[number], string> = {
  0: 'Off',
  0.5: 'Half',
  1: 'Full',
};

export function SnapControl() {
  const activeTool = useStore((s) => s.activeTool);
  const interactionMode = useStore((s) => s.interactionMode);
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const selectSnap = useStore((s) => s.selectSnap);
  const setSelectSnap = useStore((s) => s.setSelectSnap);
  const asPlayer = seesAsPlayer(role, playerView);
  const scaling = interactionMode === 'scaling';

  if (!showsGridSnapControl(activeTool, asPlayer) && !scaling) return null;

  return (
    <div
      className="pointer-events-auto absolute right-3 top-3 z-30 flex flex-col items-end gap-1 rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 py-2 shadow-lg backdrop-blur"
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onTouchStart={stopBubble}
    >
      <span className="text-[10px] font-medium text-slate-500">press spacebar to cycle</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-slate-400">Snap</span>
        <div className="flex overflow-hidden rounded-md border border-slate-600">
          {GRID_SNAP_CYCLE.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSelectSnap(value)}
              title={`Snap ${SNAP_LABELS[value]} (${value})`}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                Math.abs(selectSnap - value) < 0.01
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {SNAP_LABELS[value]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
