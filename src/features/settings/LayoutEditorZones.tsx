import type { ActiveDragState, DragHoverPoint, SplitEdge } from '../layout/layoutTreeUtils';
import type { LayoutNode } from '../layout/schema/layoutSchema';
import { LayoutPreview } from './LayoutPreview';

type Props = {
  node: LayoutNode;
  layoutKey: string;
  previewLocked: boolean;
  onSplitResize: (path: number[], sizes: number[]) => void;
  onDrop: (targetPath: number[], e: React.DragEvent, edge?: SplitEdge) => void;
  onDragHover: (targetPath: number[] | null, edge?: SplitEdge, point?: DragHoverPoint) => void;
  onContainerDragStart: (fromPath: number[], point?: DragHoverPoint) => void;
  onTabDragStart: (fromPath: number[], tabId: string, point?: DragHoverPoint) => void;
  onCollapseAttachedDragStart: (fromPath: number[]) => (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onTabSelect: (path: number[], tabId: string) => void;
  onTabMove: (fromPath: number[], tabId: string, toPath: number[]) => void;
  ghostPath: number[] | null;
  dropTargetPath: number[] | null;
  hoverEdge?: SplitEdge;
  activeDrag: ActiveDragState | null;
  acceptPreviewPointer: (clientX: number, clientY: number) => boolean;
};

export function LayoutEditorZones(props: Props) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md border border-slate-700 bg-slate-950">
      <LayoutPreview {...props} />
    </div>
  );
}
