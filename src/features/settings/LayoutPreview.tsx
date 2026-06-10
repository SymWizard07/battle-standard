import { useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { getPanelCollapse } from '../layout/layoutPanelChrome';
import type { LayoutNode, SplitLayoutNode, TabsLayoutNode } from '../layout/schema/layoutSchema';
import type { ActiveDragState, DragHoverPoint, SplitEdge } from '../layout/layoutTreeUtils';
import {
  decodeContainerDrag,
  detectSplitEdge,
  encodeContainerDrag,
  getNodeLabel,
  LAYOUT_CONTAINER_DRAG_TYPE,
  parseModuleDragData,
  buildDefaultSplitLayout,
  splitPanelGroupKey,
} from '../layout/layoutTreeUtils';
import { LAYOUT_MODULE_DRAG_TYPE } from '../layout/LayoutModuleContext';
import { decodeTabDragPayload, encodeTabDragPayload, LAYOUT_TAB_DRAG_TYPE } from '../layout/shell/layoutContext';
import type { CollapseDirection } from '../layout/schema/layoutSchema';
import { attachPaletteDragImage, previewBoxClass, previewEdgeOverlayClass } from './layoutDragGhost';
import { PreviewCollapseBadge } from './PreviewCollapseBadge';

type Props = {
  node: LayoutNode;
  path?: number[];
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

function findCommittedPathAnchor(from: HTMLElement): HTMLElement {
  let node: HTMLElement | null = from.parentElement;
  while (node) {
    if (node.dataset.committedPath !== undefined) return node;
    node = node.parentElement;
  }
  return from;
}

function edgeAtEvent(el: HTMLElement, e: React.DragEvent): SplitEdge | undefined {
  const anchor = findCommittedPathAnchor(el);
  return detectSplitEdge(anchor, e.clientX, e.clientY);
}

function hoverEdgeAtEvent(
  activeDrag: ActiveDragState | null,
  el: HTMLElement,
  e: React.DragEvent,
): SplitEdge | undefined {
  if (activeDrag?.kind === 'collapse-palette' || activeDrag?.kind === 'collapse-attached') {
    return undefined;
  }
  return edgeAtEvent(el, e);
}

function dragPoint(e: React.DragEvent): DragHoverPoint {
  return { clientX: e.clientX, clientY: e.clientY };
}

function pathMatches(a: number[], b: number[] | null): boolean {
  if (!b) return false;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function isContainerDragSource(path: number[], activeDrag: ActiveDragState | null): boolean {
  return activeDrag?.kind === 'container' && pathMatches(path, activeDrag.fromPath);
}

function isTabDragSource(
  path: number[],
  tabId: string,
  activeDrag: ActiveDragState | null,
): boolean {
  return (
    activeDrag?.kind === 'tab' &&
    pathMatches(path, activeDrag.fromPath) &&
    activeDrag.tabId === tabId
  );
}

export function LayoutPreview({
  node,
  path = [],
  layoutKey,
  previewLocked,
  onSplitResize,
  onDrop,
  onDragHover,
  onContainerDragStart,
  onTabDragStart,
  onCollapseAttachedDragStart,
  onDragEnd,
  onTabSelect,
  onTabMove,
  ghostPath,
  dropTargetPath,
  hoverEdge,
  activeDrag,
  acceptPreviewPointer,
}: Props) {
  const content =
    node.type === 'empty' ? (
      <PreviewEmpty
        path={path}
        onDrop={onDrop}
        onDragHover={onDragHover}
        onDragEnd={onDragEnd}
        ghostPath={ghostPath}
        dropTargetPath={dropTargetPath}
        hoverEdge={hoverEdge}
        activeDrag={activeDrag}
        acceptPreviewPointer={acceptPreviewPointer}
      />
    ) : node.type === 'split' ? (
      <PreviewSplit
        node={node}
        path={path}
        layoutKey={layoutKey}
        previewLocked={previewLocked}
        onSplitResize={onSplitResize}
        onDrop={onDrop}
        onDragHover={onDragHover}
        onContainerDragStart={onContainerDragStart}
        onTabDragStart={onTabDragStart}
        onCollapseAttachedDragStart={onCollapseAttachedDragStart}
        onDragEnd={onDragEnd}
        onTabSelect={onTabSelect}
        onTabMove={onTabMove}
        ghostPath={ghostPath}
        dropTargetPath={dropTargetPath}
        hoverEdge={hoverEdge}
        activeDrag={activeDrag}
        acceptPreviewPointer={acceptPreviewPointer}
      />
    ) : node.type === 'tabs' ? (
      <PreviewTabs
        node={node}
        path={path}
        onDrop={onDrop}
        onDragHover={onDragHover}
        onContainerDragStart={onContainerDragStart}
        onTabDragStart={onTabDragStart}
        onCollapseAttachedDragStart={onCollapseAttachedDragStart}
        onDragEnd={onDragEnd}
        onTabSelect={onTabSelect}
        onTabMove={onTabMove}
        collapse={node.collapse}
        ghostPath={ghostPath}
        dropTargetPath={dropTargetPath}
        hoverEdge={hoverEdge}
        activeDrag={activeDrag}
        acceptPreviewPointer={acceptPreviewPointer}
      />
    ) : (
      <PreviewLeaf
        label={getNodeLabel(node)}
        path={path}
        collapse={getPanelCollapse(node)}
        onDrop={onDrop}
        onDragHover={onDragHover}
        onContainerDragStart={onContainerDragStart}
        onCollapseAttachedDragStart={onCollapseAttachedDragStart}
        onDragEnd={onDragEnd}
        ghostPath={ghostPath}
        dropTargetPath={dropTargetPath}
        hoverEdge={hoverEdge}
        activeDrag={activeDrag}
        acceptPreviewPointer={acceptPreviewPointer}
      />
    );

  return <div className="h-full min-h-0 w-full">{content}</div>;
}

type SharedProps = {
  onDrop: Props['onDrop'];
  onDragHover: Props['onDragHover'];
  onContainerDragStart: Props['onContainerDragStart'];
  onTabDragStart: Props['onTabDragStart'];
  onCollapseAttachedDragStart: Props['onCollapseAttachedDragStart'];
  onDragEnd: Props['onDragEnd'];
  onTabSelect: Props['onTabSelect'];
  onTabMove: Props['onTabMove'];
  ghostPath: number[] | null;
  dropTargetPath: number[] | null;
  hoverEdge?: SplitEdge;
  activeDrag: ActiveDragState | null;
  acceptPreviewPointer: (clientX: number, clientY: number) => boolean;
};

type SplitProps = SharedProps & {
  node: SplitLayoutNode;
  path: number[];
  layoutKey: string;
  previewLocked: boolean;
  onSplitResize: (path: number[], sizes: number[]) => void;
};

function PreviewSplit({
  node,
  path,
  layoutKey,
  previewLocked,
  onSplitResize,
  onDrop,
  onDragHover,
  onContainerDragStart,
  onTabDragStart,
  onCollapseAttachedDragStart,
  onDragEnd,
  onTabSelect,
  onTabMove,
  ghostPath,
  dropTargetPath,
  hoverEdge,
  activeDrag,
  acceptPreviewPointer,
}: SplitProps) {
  const orientation = node.direction === 'row' ? 'horizontal' : 'vertical';
  const defaultLayout = buildDefaultSplitLayout(node.children, node.sizes, {
    startCollapsedPanels: false,
  });

  const handleLayoutChanged = (layout: Record<string, number>) => {
    if (previewLocked) return;
    const sizes = node.children.map((child) => layout[child.id] ?? 0);
    onSplitResize(path, sizes);
  };

  return (
    <div
      data-committed-path={path.join('.')}
      className="flex h-full min-h-0 w-full flex-col"
    >
      <Group
        key={`${layoutKey}:${splitPanelGroupKey(node)}`}
        id={`preview-${node.id}`}
        orientation={orientation}
        defaultLayout={defaultLayout}
        onLayoutChanged={previewLocked ? undefined : handleLayoutChanged}
        className="h-full min-h-0 w-full flex-1"
      >
      {node.children.map((child, i) => {
        const childPath = [...path, i];
        const isGhost = pathMatches(childPath, ghostPath);
        const isDropTarget = pathMatches(childPath, dropTargetPath);

        return (
          <PreviewSplitChild
            key={child.id}
            child={child}
            childPath={childPath}
            index={i}
            count={node.children.length}
            layoutKey={layoutKey}
            previewLocked={previewLocked}
            onSplitResize={onSplitResize}
            onDrop={onDrop}
            onDragHover={onDragHover}
            onContainerDragStart={onContainerDragStart}
            onTabDragStart={onTabDragStart}
            onCollapseAttachedDragStart={onCollapseAttachedDragStart}
            onDragEnd={onDragEnd}
            onTabSelect={onTabSelect}
            onTabMove={onTabMove}
            isGhost={isGhost}
            isDropTarget={isDropTarget}
            ghostPath={ghostPath}
            dropTargetPath={dropTargetPath}
            hoverEdge={hoverEdge}
            activeDrag={activeDrag}
            acceptPreviewPointer={acceptPreviewPointer}
          />
        );
      })}
      </Group>
    </div>
  );
}

type SplitChildProps = SharedProps & {
  child: LayoutNode;
  childPath: number[];
  index: number;
  count: number;
  layoutKey: string;
  previewLocked: boolean;
  onSplitResize: SplitProps['onSplitResize'];
  isGhost: boolean;
  isDropTarget: boolean;
};

function PreviewSplitChild({
  child,
  childPath,
  index,
  count,
  layoutKey,
  previewLocked,
  onSplitResize,
  onDrop,
  onDragHover,
  onContainerDragStart,
  onTabDragStart,
  onCollapseAttachedDragStart,
  onDragEnd,
  onTabSelect,
  onTabMove,
  isGhost,
  isDropTarget,
  ghostPath,
  dropTargetPath,
  hoverEdge,
  activeDrag,
  acceptPreviewPointer,
}: SplitChildProps) {
  // Leaf/tab panels render their own edge overlay; only wrap nested splits here.
  const childRendersEdgePreview =
    child.type === 'module' ||
    child.type === 'tabs' ||
    child.type === 'playArea' ||
    child.type === 'empty';
  const showEdgePreview =
    isDropTarget && hoverEdge != null && !childRendersEdgePreview;
  return (
    <>
      <Panel
        id={child.id}
        minSize={5}
        className={`h-full min-h-0 min-w-0 overflow-hidden ${
          isGhost
            ? 'ring-2 ring-inset ring-sky-400'
            : isDropTarget
              ? 'ring-2 ring-inset ring-sky-500/60'
              : ''
        }`}
      >
        <div className="relative flex h-full w-full min-h-0 min-w-0 flex-col p-0.5">
          {showEdgePreview && (
            <div className={`${previewEdgeOverlayClass(hoverEdge)} z-10 flex items-center justify-center`}>
              <span className="text-[10px] font-medium text-sky-100">Split</span>
            </div>
          )}
          <LayoutPreview
            node={child}
            path={childPath}
            layoutKey={layoutKey}
            previewLocked={previewLocked}
            onSplitResize={onSplitResize}
            onDrop={onDrop}
            onDragHover={onDragHover}
            onContainerDragStart={onContainerDragStart}
            onTabDragStart={onTabDragStart}
            onCollapseAttachedDragStart={onCollapseAttachedDragStart}
            onDragEnd={onDragEnd}
            onTabSelect={onTabSelect}
            onTabMove={onTabMove}
            ghostPath={ghostPath}
            dropTargetPath={dropTargetPath}
            hoverEdge={hoverEdge}
            activeDrag={activeDrag}
            acceptPreviewPointer={acceptPreviewPointer}
          />
        </div>
      </Panel>
      {index < count - 1 && (
        <Separator
          className={`bg-slate-600 hover:bg-sky-500 data-[separator-active]:bg-sky-400 ${
            previewLocked ? 'pointer-events-none opacity-50' : ''
          }`}
        />
      )}
    </>
  );
}

type EmptyProps = {
  path: number[];
  onDrop: Props['onDrop'];
  onDragHover: Props['onDragHover'];
  onDragEnd: Props['onDragEnd'];
  ghostPath: number[] | null;
  dropTargetPath: number[] | null;
  hoverEdge?: SplitEdge;
  activeDrag: ActiveDragState | null;
  acceptPreviewPointer: (clientX: number, clientY: number) => boolean;
};

function PreviewEmpty({
  path,
  onDrop,
  onDragHover,
  onDragEnd,
  dropTargetPath,
  hoverEdge,
  activeDrag,
  acceptPreviewPointer,
}: EmptyProps) {
  const isDropTarget = pathMatches(path, dropTargetPath);

  const handleDragOver = (e: React.DragEvent) => {
    if (!acceptPreviewPointer(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = activeDrag?.kind === 'palette' ? 'copy' : 'move';
    onDragHover(path, undefined, dragPoint(e));
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!acceptPreviewPointer(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    onDragHover(null);
    onDrop(path, e);
  };

  return (
    <div
      data-committed-path={path.join('.')}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={onDragEnd}
      className={`flex h-full min-h-[8rem] w-full items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm ${
        isDropTarget
          ? 'border-sky-400 bg-sky-950/30 text-sky-200'
          : 'border-slate-600 bg-slate-900/50 text-slate-400'
      }`}
    >
      {isDropTarget && hoverEdge != null ? (
        <span className="text-xs font-medium text-sky-100">Release to place</span>
      ) : (
        <span>Drag modules here to build your layout</span>
      )}
    </div>
  );
}

type LeafProps = {
  label: string;
  path: number[];
  collapse?: CollapseDirection;
  onDrop: Props['onDrop'];
  onDragHover: Props['onDragHover'];
  onContainerDragStart: Props['onContainerDragStart'];
  onCollapseAttachedDragStart: Props['onCollapseAttachedDragStart'];
  onDragEnd: Props['onDragEnd'];
  ghostPath: number[] | null;
  dropTargetPath: number[] | null;
  hoverEdge?: SplitEdge;
  activeDrag: ActiveDragState | null;
  acceptPreviewPointer: (clientX: number, clientY: number) => boolean;
};

function PreviewLeaf({
  label,
  path,
  collapse,
  onDrop,
  onDragHover,
  onContainerDragStart,
  onCollapseAttachedDragStart,
  onDragEnd,
  ghostPath,
  dropTargetPath,
  hoverEdge,
  activeDrag,
  acceptPreviewPointer,
}: LeafProps) {
  const isGhost = pathMatches(path, ghostPath);
  const isDropTarget = pathMatches(path, dropTargetPath) && !isGhost;
  const isDraggingSource = isContainerDragSource(path, activeDrag);
  const showEdgePreview = isDropTarget && hoverEdge != null;

  const handleDragStart = (e: React.DragEvent) => {
    attachPaletteDragImage(e, label);
    e.dataTransfer.setData(LAYOUT_CONTAINER_DRAG_TYPE, encodeContainerDrag({ fromPath: path }));
    e.dataTransfer.effectAllowed = 'move';
    onContainerDragStart(path, dragPoint(e));
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!acceptPreviewPointer(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    onDragHover(path, hoverEdgeAtEvent(activeDrag, e.currentTarget as HTMLElement, e), dragPoint(e));
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!acceptPreviewPointer(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    onDragHover(null);
    onDrop(path, e, hoverEdgeAtEvent(activeDrag, e.currentTarget as HTMLElement, e));
  };

  return (
    <div
      data-committed-path={path.join('.')}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`${previewBoxClass({ isGhost, isDropTarget, isDraggingSource })} cursor-grab items-center justify-center px-2 py-1 active:cursor-grabbing`}
    >
      {showEdgePreview && (
        <div className={`${previewEdgeOverlayClass(hoverEdge)} z-10 flex items-center justify-center`}>
          <span className="text-[10px] font-medium text-sky-100">Split</span>
        </div>
      )}
      {collapse && (
        <PreviewCollapseBadge
          collapse={collapse}
          onDragStart={onCollapseAttachedDragStart(path)}
          onDragEnd={onDragEnd}
        />
      )}
      <span
        className={`pointer-events-none text-xs font-medium leading-tight ${
          isGhost ? 'text-sky-100' : 'text-slate-300'
        }`}
      >
        {label}
        {isGhost ? ' (preview)' : ''}
      </span>
    </div>
  );
}

function useStackTabsVertically(rootRef: React.RefObject<HTMLElement | null>): boolean {
  const [stackVertical, setStackVertical] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setStackVertical(height > width);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootRef]);

  return stackVertical;
}

function previewTabBoxClass(options: {
  active: boolean;
  tabDragging: boolean;
}): string {
  const base =
    'flex min-h-[2.25rem] min-w-[3.5rem] max-w-full items-center justify-center rounded-md border-2 border-dashed px-2 py-1 text-center text-[10px] font-medium leading-tight transition-all duration-200 ease-out';

  if (options.tabDragging) {
    return `${base} scale-90 border-sky-300/50 bg-sky-500/10 text-sky-100/40 opacity-30`;
  }
  if (options.active) {
    return `${base} border-sky-400 bg-sky-950/40 text-sky-200 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]`;
  }
  return `${base} border-slate-500 bg-slate-900/80 text-slate-300 hover:border-slate-400 hover:text-slate-200`;
}

type TabsProps = SharedProps & {
  node: TabsLayoutNode;
  path: number[];
  collapse?: CollapseDirection;
};

function PreviewTabs({
  node,
  path,
  collapse,
  onDrop,
  onDragHover,
  onContainerDragStart,
  onTabDragStart,
  onCollapseAttachedDragStart,
  onDragEnd,
  onTabSelect,
  ghostPath,
  dropTargetPath,
  hoverEdge,
  activeDrag,
  acceptPreviewPointer,
}: TabsProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const stackVertical = useStackTabsVertically(panelRef);
  const groupLabel = node.tabs.map((t) => t.title).join(' · ');
  const isGhost = pathMatches(path, ghostPath);
  const isDropTarget = pathMatches(path, dropTargetPath) && !isGhost;
  const isGroupDragging = isContainerDragSource(path, activeDrag);
  const showEdgePreview = isDropTarget && hoverEdge != null;

  const handleGroupDragStart = (e: React.DragEvent) => {
    attachPaletteDragImage(e, groupLabel);
    e.dataTransfer.setData(LAYOUT_CONTAINER_DRAG_TYPE, encodeContainerDrag({ fromPath: path }));
    e.dataTransfer.effectAllowed = 'move';
    onContainerDragStart(path, dragPoint(e));
  };

  const handleTabDragStart = (tabId: string, label: string) => (e: React.DragEvent) => {
    e.stopPropagation();
    attachPaletteDragImage(e, label);
    e.dataTransfer.setData(LAYOUT_TAB_DRAG_TYPE, encodeTabDragPayload({ tabId, fromPath: path }));
    e.dataTransfer.effectAllowed = 'move';
    onTabDragStart(path, tabId, dragPoint(e));
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!acceptPreviewPointer(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    onDragHover(path, hoverEdgeAtEvent(activeDrag, e.currentTarget as HTMLElement, e), dragPoint(e));
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!acceptPreviewPointer(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    onDragHover(null);
    onDrop(path, e, hoverEdgeAtEvent(activeDrag, e.currentTarget as HTMLElement, e));
  };

  return (
    <div
      ref={panelRef}
      data-committed-path={path.join('.')}
      className={`${previewBoxClass({ isGhost, isDropTarget, isDraggingSource: isGroupDragging })} relative cursor-default`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {showEdgePreview && (
        <div className={`${previewEdgeOverlayClass(hoverEdge)} z-10 flex items-center justify-center`}>
          <span className="text-[10px] font-medium text-sky-100">Split</span>
        </div>
      )}
      {collapse && (
        <PreviewCollapseBadge
          collapse={collapse}
          onDragStart={onCollapseAttachedDragStart(path)}
          onDragEnd={onDragEnd}
        />
      )}
      <div
        draggable
        onDragStart={handleGroupDragStart}
        onDragEnd={onDragEnd}
        onClick={(e) => e.stopPropagation()}
        title="Drag to reposition group"
        aria-label="Drag to reposition group"
        className="absolute right-1 top-1 z-20 flex cursor-grab items-center gap-0.5 rounded bg-slate-950/75 px-1 py-px text-[10px] leading-none text-slate-500 shadow-sm active:cursor-grabbing"
      >
        <span className="select-none" aria-hidden>
          ⠿
        </span>
        <span className="max-w-[4.5rem] truncate">Drag group</span>
      </div>
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center p-2">
        <div
          className={`flex max-h-full max-w-full gap-2 ${stackVertical ? 'flex-col' : 'flex-row'}`}
          role="tablist"
        >
          {node.tabs.map((tab) => {
            const active = tab.id === node.activeTabId;
            const tabDragging = isTabDragSource(path, tab.id, activeDrag);
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                draggable
                onDragStart={handleTabDragStart(tab.id, tab.title)}
                onDragEnd={onDragEnd}
                onClick={(e) => {
                  e.stopPropagation();
                  onTabSelect(path, tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onTabSelect(path, tab.id);
                  }
                }}
                className={`${previewTabBoxClass({ active, tabDragging })} cursor-grab active:cursor-grabbing`}
              >
                <span className="pointer-events-none truncate">{tab.title}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function handleLayoutPreviewDrop(
  tree: LayoutNode,
  targetPath: number[],
  e: React.DragEvent,
  edge: SplitEdge | undefined,
  handlers: {
    moveContainer: (from: number[], to: number[], edge?: SplitEdge) => LayoutNode;
    dropModule: (to: number[], moduleId: import('../layout/schema/layoutSchema').ModuleId, edge?: SplitEdge) => LayoutNode;
    moveTab: (from: number[], tabId: string, to: number[]) => LayoutNode;
  },
): LayoutNode {
  const containerRaw = e.dataTransfer.getData(LAYOUT_CONTAINER_DRAG_TYPE);
  if (containerRaw) {
    const parsed = decodeContainerDrag(containerRaw);
    if (parsed) return handlers.moveContainer(parsed.fromPath, targetPath, edge);
  }

  const tabRaw = e.dataTransfer.getData(LAYOUT_TAB_DRAG_TYPE);
  if (tabRaw) {
    const parsed = decodeTabDragPayload(tabRaw);
    if (parsed) return handlers.moveTab(parsed.fromPath, parsed.tabId, targetPath);
  }

  const moduleId = parseModuleDragData(e.dataTransfer.getData(LAYOUT_MODULE_DRAG_TYPE));
  if (moduleId) return handlers.dropModule(targetPath, moduleId, edge);

  return tree;
}
