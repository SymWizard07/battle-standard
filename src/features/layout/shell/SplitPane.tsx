import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Group, Panel, Separator, useGroupRef, usePanelRef } from 'react-resizable-panels';
import { useLayoutStore } from '../layoutStore';
import type { LayoutNode, SplitLayoutNode } from '../schema/layoutSchema';
import {
  getPanelCollapse,
  layoutAfterExpandingOnePanel,
  persistableSplitSizesFromLayout,
} from '../layoutPanelChrome';
import { buildDefaultSplitLayout, splitPanelGroupKey } from '../layoutTreeUtils';
import { LayoutNodeRenderer } from './LayoutNodeRenderer';
import { PanelCollapseHandle } from './PanelCollapseHandle';

type Props = {
  node: SplitLayoutNode;
  path: number[];
  mode: 'live' | 'preview';
  device: import('../schema/layoutSchema').DeviceClass;
  onSplitResize?: (path: number[], sizes: number[]) => void;
  onTabSelect?: (path: number[], tabId: string) => void;
  onTabMove?: (fromPath: number[], tabId: string, toPath: number[]) => void;
  editable?: boolean;
  dropHighlightPath?: number[] | null;
  onDropTarget?: (path: number[], e: React.DragEvent) => void;
};

export function SplitPane({
  node,
  path,
  mode,
  device,
  onSplitResize,
  onTabSelect,
  onTabMove,
  editable = false,
  dropHighlightPath,
  onDropTarget,
}: Props) {
  const layoutMountKey = useLayoutStore((s) => s.layoutMountKey);
  const groupRef = useGroupRef();
  const syncedGroupKeyRef = useRef<string | null>(null);
  const orientation = node.direction === 'row' ? 'horizontal' : 'vertical';
  const groupKey = `${splitPanelGroupKey(node)}:${layoutMountKey}`;
  // Stored (expanded) sizes only — never pass startCollapsedPanels here or the Group
  // resets collapsible panels to 0% whenever the tree updates after resize/expand.
  const defaultLayout = useMemo(
    () =>
      buildDefaultSplitLayout(node.children, node.sizes, {
        startCollapsedPanels: false,
      }),
    [groupKey],
  );

  if (node.children.length === 1) {
    const child = node.children[0]!;
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <LayoutNodeRenderer
          node={child}
          path={[...path, 0]}
          mode={mode}
          device={device}
          onSplitResize={onSplitResize}
          onTabSelect={onTabSelect}
          onTabMove={onTabMove}
          editable={editable}
          dropHighlightPath={dropHighlightPath}
          onDropTarget={onDropTarget}
        />
      </div>
    );
  }

  const handleLayoutChanged = (layout: Record<string, number>) => {
    if (!onSplitResize) return;
    const sizes = persistableSplitSizesFromLayout(node.children, layout, node.sizes);
    if (sizes == null) return;
    const unchanged =
      sizes.length === node.sizes.length &&
      sizes.every((s, i) => Math.abs(s - (node.sizes[i] ?? 0)) < 0.05);
    if (unchanged) return;
    onSplitResize(path, sizes);
  };

  const restorePanelLayout = useCallback(
    (panelId: string, expandToPercent: number) => {
      const group = groupRef.current;
      if (!group) return;
      try {
        const next = layoutAfterExpandingOnePanel(
          node.children,
          group.getLayout(),
          panelId,
          expandToPercent,
        );
        group.setLayout(next);
      } catch {
        /* group unmounting */
      }
    },
    [groupRef, node.children],
  );

  const groupId = path.length === 0 ? node.id : `${path.join('.')}:${node.id}`;

  useLayoutEffect(() => {
    if (mode !== 'live' || node.children.length <= 1) return;
    if (syncedGroupKeyRef.current === groupKey) return;

    const applyInitialLayout = () => {
      if (syncedGroupKeyRef.current === groupKey) return true;
      const group = groupRef.current;
      if (!group) return false;
      syncedGroupKeyRef.current = groupKey;
      try {
        group.setLayout(defaultLayout);
      } catch {
        /* group unmounting */
      }
      return true;
    };

    if (applyInitialLayout()) return;
    const frame = requestAnimationFrame(applyInitialLayout);
    return () => {
      cancelAnimationFrame(frame);
      syncedGroupKeyRef.current = null;
    };
  }, [groupKey, defaultLayout, groupRef, mode, node.children.length]);

  return (
    <Group
      key={groupKey}
      groupRef={groupRef}
      id={groupId}
      orientation={orientation}
      defaultLayout={defaultLayout}
      onLayoutChanged={onSplitResize ? handleLayoutChanged : undefined}
      className="flex h-full min-h-0 min-w-0 flex-1 overflow-visible"
      disabled={mode === 'preview' && !editable}
    >
      {node.children.map((child, i) => {
        const childPath = [...path, i];
        const highlighted =
          dropHighlightPath != null &&
          dropHighlightPath.length === childPath.length &&
          dropHighlightPath.every((v, idx) => v === childPath[idx]);

        return (
          <SplitChild
            key={`${child.id}:${getPanelCollapse(child) ?? ''}`}
            child={child}
            childPath={childPath}
            index={i}
            count={node.children.length}
            mode={mode}
            device={device}
            onSplitResize={onSplitResize}
            onTabSelect={onTabSelect}
            onTabMove={onTabMove}
            editable={editable}
            highlighted={highlighted}
            dropHighlightPath={dropHighlightPath}
            onDropTarget={onDropTarget}
            storedSizePercent={node.sizes[i] ?? 100 / node.children.length}
            onRestoreExpandedLayout={() =>
              restorePanelLayout(
                child.id,
                node.sizes[i] ?? 100 / node.children.length,
              )
            }
          />
        );
      })}
    </Group>
  );
}

type ChildProps = {
  child: LayoutNode;
  childPath: number[];
  index: number;
  count: number;
  mode: 'live' | 'preview';
  device: import('../schema/layoutSchema').DeviceClass;
  onSplitResize?: (path: number[], sizes: number[]) => void;
  onTabSelect?: (path: number[], tabId: string) => void;
  onTabMove?: (fromPath: number[], tabId: string, toPath: number[]) => void;
  editable?: boolean;
  highlighted?: boolean;
  dropHighlightPath?: number[] | null;
  onDropTarget?: (path: number[], e: React.DragEvent) => void;
  storedSizePercent: number;
  onRestoreExpandedLayout?: () => void;
};

function SplitChild({
  child,
  childPath,
  index,
  count,
  mode,
  device,
  onSplitResize,
  onTabSelect,
  onTabMove,
  editable,
  highlighted,
  dropHighlightPath,
  onDropTarget,
  storedSizePercent,
  onRestoreExpandedLayout,
}: ChildProps) {
  const panelRef = usePanelRef();
  const panelElementRef = useRef<HTMLDivElement>(null);
  const collapseDirection = getPanelCollapse(child);
  const hasCollapseControl = collapseDirection != null && child.type !== 'playArea';
  const panelMinSize = child.type === 'playArea' ? 20 : 0;

  return (
    <>
      <Panel
        id={child.id}
        panelRef={panelRef}
        elementRef={panelElementRef}
        minSize={panelMinSize}
        collapsible={hasCollapseControl}
        collapsedSize={hasCollapseControl ? '0%' : undefined}
        className={highlighted ? 'ring-2 ring-inset ring-sky-500' : undefined}
        style={hasCollapseControl ? { overflow: 'visible' } : undefined}
      >
        <div
          className="relative flex h-full min-h-0 min-w-0 flex-col"
          onDragOver={
            editable && onDropTarget
              ? (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }
              : undefined
          }
          onDrop={
            editable && onDropTarget
              ? (e) => {
                  e.preventDefault();
                  onDropTarget(childPath, e);
                }
              : undefined
          }
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <LayoutNodeRenderer
              node={child}
              path={childPath}
              mode={mode}
              device={device}
              onSplitResize={onSplitResize}
              onTabSelect={onTabSelect}
              onTabMove={onTabMove}
              editable={editable}
              dropHighlightPath={dropHighlightPath}
              onDropTarget={onDropTarget}
            />
          </div>
          {hasCollapseControl && collapseDirection && (
            <div className="pointer-events-none absolute inset-0 overflow-visible">
              <PanelCollapseHandle
                panelRef={panelRef}
                panelElementRef={panelElementRef}
                collapse={collapseDirection}
                storedSizePercent={storedSizePercent}
                onRestoreExpandedLayout={onRestoreExpandedLayout}
              />
            </div>
          )}
        </div>
      </Panel>
      {index < count - 1 && (
        <Separator className="bg-slate-700 data-[separator-active]:bg-sky-500" />
      )}
    </>
  );
}
