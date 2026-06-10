import type { MouseEvent, PointerEvent, TouchEvent } from 'react';
import { useStore } from '../../store/useStore';

function stopBubble(e: MouseEvent | PointerEvent | TouchEvent) {
  e.stopPropagation();
}

const btnClass =
  'flex h-10 w-10 items-center justify-center rounded-lg border border-transparent bg-transparent transition-colors disabled:pointer-events-none disabled:opacity-25 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-slate-400/30 text-slate-400/30 hover:border-slate-600 hover:bg-slate-900/90 hover:text-white enabled:text-slate-400/30';

function UndoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5c0 2.2-1.3 4.1-3.2 5" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0-5.5 5.5c0 2.2 1.3 4.1 3.2 5" />
    </svg>
  );
}

export function CanvasHistoryButtons() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);

  return (
    <div
      className="pointer-events-auto absolute bottom-3 left-3 z-30 flex gap-1"
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onTouchStart={stopBubble}
    >
      <button
        type="button"
        disabled={!canUndo}
        onPointerDown={stopBubble}
        onMouseDown={stopBubble}
        onTouchStart={stopBubble}
        onClick={(e) => {
          stopBubble(e);
          undo();
        }}
        className={btnClass}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onPointerDown={stopBubble}
        onMouseDown={stopBubble}
        onTouchStart={stopBubble}
        onClick={(e) => {
          stopBubble(e);
          redo();
        }}
        className={btnClass}
        aria-label="Redo"
        title="Redo (Ctrl+Y)"
      >
        <RedoIcon />
      </button>
    </div>
  );
}
