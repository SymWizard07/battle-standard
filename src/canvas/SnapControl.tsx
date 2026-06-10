import type { MouseEvent, PointerEvent, TouchEvent } from 'react';
import {
  GRID_SNAP_STEP,
  quantizeGridSnapStrength,
  showsGridSnapControl,
} from '../lib/gridSnap';
import { seesAsPlayer, useStore } from '../store/useStore';

function stopBubble(e: MouseEvent | PointerEvent | TouchEvent) {
  e.stopPropagation();
}

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
      <span className="text-[10px] font-medium text-slate-500">
        {scaling ? 'drag corner handles · click map to finish' : 'press spacebar to cycle'}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-400">Snap</span>
        <input
          type="range"
          min={0}
          max={1}
          step={GRID_SNAP_STEP}
          value={selectSnap}
          onChange={(e) => {
            setSelectSnap(quantizeGridSnapStrength(Number(e.target.value)));
          }}
          className="w-24 accent-sky-400"
          aria-label="Grid snap strength"
        />
        <span className="w-7 text-xs tabular-nums text-slate-300">{selectSnap.toFixed(1)}</span>
      </div>
    </div>
  );
}
