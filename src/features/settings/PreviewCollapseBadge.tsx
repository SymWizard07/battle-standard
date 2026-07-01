import type { CollapseDirection } from '../layout/schema/layoutSchema';
import { COLLAPSE_ARROWS, collapseLinkClassName } from '../layout/layoutPanelChrome';

type Props = {
  collapse: CollapseDirection;
  linkId: string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
};

export function PreviewCollapseBadge({ collapse, linkId, onDragStart, onDragEnd }: Props) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      title="Drag out of preview to remove collapse control"
      className={`absolute left-1 top-1 z-20 flex h-6 min-w-6 cursor-grab items-center justify-center rounded border px-1 text-[10px] font-semibold shadow active:cursor-grabbing ${collapseLinkClassName(linkId)}`}
    >
      <span className="pointer-events-none">{COLLAPSE_ARROWS[collapse]}</span>
    </div>
  );
}
