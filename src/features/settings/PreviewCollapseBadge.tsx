import type { CollapseDirection } from '../layout/schema/layoutSchema';
import { COLLAPSE_ARROWS } from '../layout/layoutPanelChrome';

type Props = {
  collapse: CollapseDirection;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
};

export function PreviewCollapseBadge({ collapse, onDragStart, onDragEnd }: Props) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      title="Drag out of preview to remove collapse control"
      className="absolute left-1 top-1 z-20 flex h-6 min-w-6 cursor-grab items-center justify-center rounded border border-slate-500 bg-slate-800/95 px-1 text-[10px] font-semibold text-sky-200 shadow active:cursor-grabbing"
    >
      <span className="pointer-events-none">{COLLAPSE_ARROWS[collapse]}</span>
    </div>
  );
}
