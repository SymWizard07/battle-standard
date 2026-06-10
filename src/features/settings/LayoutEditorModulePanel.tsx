import type { ModuleId } from '../layout/schema/layoutSchema';
import { MODULE_LABELS } from '../layout/schema/layoutSchema';
import { previewBoxClass } from './layoutDragGhost';

type Props = {
  moduleId: ModuleId;
  isGhost?: boolean;
  isDraggingSource?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  className?: string;
};

/** Single-module preview panel (matches LayoutPreview PreviewLeaf styling). */
export function LayoutEditorModulePanel({
  moduleId,
  isGhost,
  isDraggingSource,
  draggable,
  onDragStart,
  onDragEnd,
  className = '',
}: Props) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`${previewBoxClass({ isGhost, isDraggingSource })} flex min-h-0 min-w-0 flex-1 items-center justify-center px-2 py-1 ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${className}`}
    >
      <span
        className={`pointer-events-none text-center text-xs font-medium leading-tight ${
          isGhost ? 'text-sky-100' : 'text-slate-300'
        }`}
      >
        {MODULE_LABELS[moduleId]}
        {isGhost ? ' (preview)' : ''}
      </span>
    </div>
  );
}
