import type { MouseEvent, PointerEvent, TouchEvent } from 'react';
import { useStore } from '../../store/useStore';

function stopBubble(e: MouseEvent | PointerEvent | TouchEvent) {
  e.stopPropagation();
}

export function CanvasHomeButton() {
  const resetViewport = useStore((s) => s.resetViewport);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    stopBubble(e);
    resetViewport();
  };

  return (
    <div
      className="pointer-events-auto absolute left-3 top-3 z-30"
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onTouchStart={stopBubble}
    >
      <button
        type="button"
        onPointerDown={stopBubble}
        onMouseDown={stopBubble}
        onTouchStart={stopBubble}
        onClick={handleClick}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent bg-transparent text-slate-400/30 transition-colors hover:border-slate-600 hover:bg-slate-900/90 hover:text-white"
        aria-label="Frame maps"
        title="Frame maps"
      >
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
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20h14V9.5" />
        </svg>
      </button>
    </div>
  );
}
