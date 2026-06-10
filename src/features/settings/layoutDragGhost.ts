import type { SplitEdge } from '../layout/layoutTreeUtils';

const GHOST_CLASS =
  'rounded-full border border-sky-300 bg-sky-500/90 px-3 py-1 text-xs font-medium text-sky-50 shadow-lg';

/** Renders a palette-style chip as the native drag image (follows cursor). */
export function attachPaletteDragImage(e: React.DragEvent, label: string): void {
  const ghost = document.createElement('div');
  ghost.className = GHOST_CLASS;
  ghost.textContent = label;
  ghost.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:nowrap;pointer-events:none;';
  document.body.appendChild(ghost);
  const w = ghost.offsetWidth;
  const h = ghost.offsetHeight;
  e.dataTransfer.setDragImage(ghost, w / 2, h / 2);
  window.requestAnimationFrame(() => ghost.remove());
}

export function previewEdgeOverlayClass(edge: SplitEdge): string {
  const base =
    'pointer-events-none absolute rounded-md border-2 border-dashed border-sky-300 bg-sky-500/25 animate-pulse shadow-[inset_0_0_0_1px_rgba(56,189,248,0.5)]';
  switch (edge) {
    case 'left':
      return `${base} inset-y-2 left-2 w-[30%]`;
    case 'right':
      return `${base} inset-y-2 right-2 w-[30%]`;
    case 'top':
      return `${base} inset-x-2 top-2 h-[30%]`;
    case 'bottom':
      return `${base} inset-x-2 bottom-2 h-[30%]`;
  }
}

export function previewBoxClass(options: {
  isGhost?: boolean;
  isDropTarget?: boolean;
  isDraggingSource?: boolean;
}): string {
  const { isGhost, isDropTarget, isDraggingSource } = options;
  const base =
    'relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border-2 border-dashed text-center transition-all duration-200 ease-out';

  if (isDraggingSource) {
    return `${base} scale-[0.94] border-slate-600 bg-slate-900/30 opacity-30`;
  }
  if (isGhost) {
    return `${base} animate-pulse border-sky-300 bg-sky-500/25 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.5)]`;
  }
  if (isDropTarget) {
    return `${base} border-sky-500/70 bg-sky-950/40`;
  }
  return `${base} border-slate-500 bg-slate-900/80`;
}
