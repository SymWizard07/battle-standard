import type { LayoutNode } from '../schema/layoutSchema';
import { ModuleSlot } from './ModuleSlot';
import { SplitPane } from './SplitPane';
import { TabGroupPane } from './TabGroupPane';

type Props = {
  node: LayoutNode;
  path?: number[];
  mode: 'live' | 'preview';
  device: import('../schema/layoutSchema').DeviceClass;
  onSplitResize?: (path: number[], sizes: number[]) => void;
  onTabSelect?: (path: number[], tabId: string) => void;
  onTabMove?: (fromPath: number[], tabId: string, toPath: number[]) => void;
  editable?: boolean;
  dropHighlightPath?: number[] | null;
  onDropTarget?: (path: number[], e: React.DragEvent) => void;
};

export function LayoutNodeRenderer({
  node,
  path = [],
  mode,
  device,
  onSplitResize,
  onTabSelect,
  onTabMove,
  editable = false,
  dropHighlightPath,
  onDropTarget,
}: Props) {
  if (node.type === 'empty') {
    return null;
  }

  if (node.type === 'split') {
    return (
      <SplitPane
        node={node}
        path={path}
        mode={mode}
        device={device}
        onSplitResize={onSplitResize}
        onTabSelect={onTabSelect}
        onTabMove={onTabMove}
        editable={editable}
        dropHighlightPath={dropHighlightPath}
        onDropTarget={onDropTarget}
      />
    );
  }

  if (node.type === 'tabs') {
    const highlighted =
      dropHighlightPath != null &&
      dropHighlightPath.length === path.length &&
      dropHighlightPath.every((v, i) => v === path[i]);

    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <TabGroupPane
          node={node}
          path={path}
          mode={mode}
          device={device}
          onTabSelect={onTabSelect}
          onTabMove={onTabMove}
          editable={editable}
          highlighted={highlighted}
          onDropTarget={onDropTarget}
        />
      </div>
    );
  }

  if (node.type === 'playArea') {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <ModuleSlot moduleId="canvas" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <ModuleSlot moduleId={node.moduleId} />
    </div>
  );
}
