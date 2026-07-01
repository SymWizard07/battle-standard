import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, Separator, useGroupRef, usePanelRef } from 'react-resizable-panels';
import { useLayoutStore } from '../layoutStore';
import type { LayoutNode, SplitLayoutNode } from '../schema/layoutSchema';
import {
  getPanelCollapse,
  layoutAfterExpandingOnePanel,
  persistableSplitSizesFromLayout,
} from '../layoutPanelChrome';
import { buildDefaultSplitLayout, splitPanelGroupKey } from '../layoutTreeUtils';
import { ModulePanelProvider, sharedEdgesInSplit } from '../ModulePanelContext';
import { useSnappingSplitHandlers } from '../useSnappingSplitHandlers';
import { LayoutNodeRenderer } from './LayoutNodeRenderer';
import { PanelCollapseHandle } from './PanelCollapseHandle';
import { usePanelCollapsed } from './usePanelCollapsed';

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
  const groupElementRef = useRef<HTMLDivElement>(null);
  const syncedGroupKeyRef = useRef<string | null>(null);
  const [collapsedByPanelId, setCollapsedByPanelId] = useState<Record<string, boolean>>({});
  const reportPanelCollapsed = useCallback((panelId: string, collapsed: boolean) => {
    setCollapsedByPanelId((prev) => {
      if (prev[panelId] === collapsed) return prev;
      return { ...prev, [panelId]: collapsed };
    });
  }, []);
  const orientation = node.direction === 'row' ? 'horizontal' : 'vertical';
  const groupKey = `${splitPanelGroupKey(node)}:${layoutMountKey}`;
  const defaultLayout = useMemo(
    () => buildDefaultSplitLayout(node.children, node.sizes),
    [groupKey, node.children, node.sizes],
  );
  const collapsedByPanelIdRef = useRef(collapsedByPanelId);
  collapsedByPanelIdRef.current = collapsedByPanelId;

  const childIds = useMemo(() => node.children.map((child) => child.id), [node.children]);

  const commitLayout = useCallback(
    (layout: Record<string, number>) => {
      if (!onSplitResize) return;
      if (Object.values(collapsedByPanelIdRef.current).some(Boolean)) return;
      const sizes = persistableSplitSizesFromLayout(node.children, layout, node.sizes);
      if (sizes == null) return;
      const unchanged =
        sizes.length === node.sizes.length &&
        sizes.every((s, i) => Math.abs(s - (node.sizes[i] ?? 0)) < 0.05);
      if (unchanged) return;
      onSplitResize(path, sizes);
    },
    [node.children, node.sizes, onSplitResize, path],
  );

  const { onLayoutChange, onLayoutChanged, syncPrevLayout } = useSnappingSplitHandlers({
    enabled: Boolean(onSplitResize),
    orientation,
    childIds,
    groupRef,
    groupElementRef,
    onCommit: commitLayout,
  });

  useLayoutEffect(() => {
    syncPrevLayout(defaultLayout);
  }, [defaultLayout, syncPrevLayout]);

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

  const handleLayoutChanged = onLayoutChanged;

  const restorePanelLayout = useCallback(
    (panelId: string) => {
      const group = groupRef.current;
      if (!group) return;
      try {
        const next = layoutAfterExpandingOnePanel(
          node.children,
          group.getLayout(),
          panelId,
          node.sizes,
        );
        group.setLayout(next);
      } catch {
        /* group unmounting */
      }
    },
    [groupRef, node.children, node.sizes],
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
      elementRef={groupElementRef}
      id={groupId}
      orientation={orientation}
      defaultLayout={defaultLayout}
      onLayoutChange={onSplitResize ? onLayoutChange : undefined}
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
        const nextChild = node.children[i + 1];
        const selfCollapsible = getPanelCollapse(child) != null && child.type !== 'playArea';
        const nextCollapsible =
          nextChild != null &&
          getPanelCollapse(nextChild) != null &&
          nextChild.type !== 'playArea';
        const selfCollapsed = collapsedByPanelId[child.id] ?? false;
        const nextCollapsed = nextChild ? (collapsedByPanelId[nextChild.id] ?? false) : false;
        const separatorDisabled =
          mode === 'live' &&
          ((selfCollapsible && selfCollapsed) || (nextCollapsible && nextCollapsed));

        return (
          <SplitChild
            key={`${child.id}:${getPanelCollapse(child) ?? ''}`}
            child={child}
            childPath={childPath}
            index={i}
            count={node.children.length}
            splitDirection={node.direction}
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
            separatorDisabled={separatorDisabled}
            onCollapsedChange={reportPanelCollapsed}
            onRestoreExpandedLayout={() => restorePanelLayout(child.id)}
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
  splitDirection: 'row' | 'col';
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
  separatorDisabled?: boolean;
  onCollapsedChange?: (panelId: string, collapsed: boolean) => void;
  onRestoreExpandedLayout?: () => void;
};

function SplitChild({
  child,
  childPath,
  index,
  count,
  splitDirection,
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
  separatorDisabled = false,
  onCollapsedChange,
  onRestoreExpandedLayout,
}: ChildProps) {
  const panelRef = usePanelRef();
  const panelElementRef = useRef<HTMLDivElement>(null);
  const collapseDirection = getPanelCollapse(child);
  const hasCollapseControl = collapseDirection != null && child.type !== 'playArea';
  const panelMinSize = child.type === 'playArea' ? 20 : 0;
  const collapsed = usePanelCollapsed(panelRef, panelElementRef);

  useLayoutEffect(() => {
    if (!hasCollapseControl) return;
    onCollapsedChange?.(child.id, collapsed);
  }, [child.id, collapsed, hasCollapseControl, onCollapsedChange]);

  const resizeLocked = mode === 'live' && hasCollapseControl && collapsed;

  return (
    <>
      <Panel
        id={child.id}
        panelRef={panelRef}
        elementRef={panelElementRef}
        minSize={panelMinSize}
        collapsible={hasCollapseControl}
        collapsedSize={hasCollapseControl ? '0%' : undefined}
        disabled={resizeLocked}
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
            <ModulePanelProvider edges={sharedEdgesInSplit(splitDirection, index, count)}>
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
            </ModulePanelProvider>
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
        <Separator
          disabled={separatorDisabled}
          className={`bg-slate-700 data-[separator-active]:bg-sky-500${
            separatorDisabled ? ' pointer-events-none opacity-40' : ''
          }`}
        />
      )}
    </>
  );
}
