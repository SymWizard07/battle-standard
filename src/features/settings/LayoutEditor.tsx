import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LAYOUT_MODULE_DRAG_TYPE } from '../layout/LayoutModuleContext';
import { useLayoutStore } from '../layout/layoutStore';
import {
  computeDragPreviewDisplayTree,
  decodeContainerDrag,
  detectSplitEdge,
  dropModuleOnTarget,
  getNodeAtPath,
  LAYOUT_CONTAINER_DRAG_TYPE,
  coalesceRemovedLayout,
  moveContainerInTree,
  moveTabToTarget,
  parseModuleDragData,
  removeNodeAtPath,
  removeTabFromGroup,
  resolveDragHover,
  stabilizeDragHover,
  type ActiveDragState,
  type DragHoverPoint,
  type PanelRectCache,
  type SplitEdge,
} from '../layout/layoutTreeUtils';
import { decodeTabDragPayload, LAYOUT_TAB_DRAG_TYPE } from '../layout/shell/layoutContext';
import {
  COLLAPSE_ARROWS,
  COLLAPSE_DIRECTIONS,
  COLLAPSE_LABELS,
  decodeCollapseDrag,
  encodeCollapseDrag,
  LAYOUT_COLLAPSE_DRAG_TYPE,
  resolveCollapseAssignmentPath,
  setPanelCollapseAtPath,
  getPanelCollapse,
} from '../layout/layoutPanelChrome';
import type { CollapseDirection, DeviceClass, LayoutNode, ModuleId } from '../layout/schema/layoutSchema';
import { MODULE_IDS, MODULE_LABELS, validateLayoutProfiles } from '../layout/schema/layoutSchema';
import { attachPaletteDragImage } from './layoutDragGhost';
import { LayoutEditorZones } from './LayoutEditorZones';
import { LayoutPreviewViewport } from './LayoutPreviewViewport';
import { useAppLayoutSurfaceSize } from './useAppLayoutSurfaceSize';

const DEVICES: { id: DeviceClass; label: string }[] = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'mobile', label: 'Mobile' },
];

type LayoutEditorProps = {
  onDragActivityChange?: (dragging: boolean) => void;
};

function isPointerInPreviewBounds(
  previewRoot: HTMLElement | null,
  clientX: number,
  clientY: number,
): boolean {
  if (!previewRoot) return false;
  const rect = previewRoot.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function findDropTargetFromPoint(
  previewRoot: HTMLElement,
  clientX: number,
  clientY: number,
  stickyEdge?: SplitEdge,
): { path: number[]; edge?: SplitEdge } | null {
  const hit = document.elementFromPoint(clientX, clientY);
  if (!hit || !previewRoot.contains(hit)) return null;
  const anchor = hit.closest('[data-committed-path]');
  if (!anchor || !previewRoot.contains(anchor)) return null;
  const pathKey = anchor.getAttribute('data-committed-path');
  if (pathKey == null) return null;
  return {
    path: pathKey === '' ? [] : pathKey.split('.').map((part) => parseInt(part, 10)),
    edge: detectSplitEdge(anchor as HTMLElement, clientX, clientY, stickyEdge),
  };
}

function collapseDragDisallowsSplitEdge(drag: ActiveDragState | null | undefined): boolean {
  return drag?.kind === 'collapse-palette' || drag?.kind === 'collapse-attached';
}

function readActiveDragFromEvent(e: React.DragEvent | DragEvent): ActiveDragState | null {
  const dt = e.dataTransfer;
  if (!dt) return null;

  const container = decodeContainerDrag(dt.getData(LAYOUT_CONTAINER_DRAG_TYPE));
  if (container) return { kind: 'container', fromPath: container.fromPath };

  const tab = decodeTabDragPayload(dt.getData(LAYOUT_TAB_DRAG_TYPE));
  if (tab) return { kind: 'tab', fromPath: tab.fromPath, tabId: tab.tabId };

  const moduleId = parseModuleDragData(
    dt.getData(LAYOUT_MODULE_DRAG_TYPE) || dt.getData('text/plain'),
  );
  if (moduleId) return { kind: 'palette', moduleId };

  const collapse = decodeCollapseDrag(dt.getData(LAYOUT_COLLAPSE_DRAG_TYPE));
  if (collapse?.kind === 'palette') {
    return { kind: 'collapse-palette', direction: collapse.direction };
  }
  if (collapse?.kind === 'attached') {
    return { kind: 'collapse-attached', fromPath: collapse.fromPath };
  }

  return null;
}

export function LayoutEditor({ onDragActivityChange }: LayoutEditorProps) {
  const editorDraft = useLayoutStore((s) => s.editorDraft);
  const layoutProfiles = useLayoutStore((s) => s.layoutProfiles);
  const editorDevice = useLayoutStore((s) => s.editorDevice);
  const beginLayoutEdit = useLayoutStore((s) => s.beginLayoutEdit);
  const setEditorDevice = useLayoutStore((s) => s.setEditorDevice);
  const updateEditorDraft = useLayoutStore((s) => s.updateEditorDraft);
  const applyEditorDraft = useLayoutStore((s) => s.applyEditorDraft);
  const resetLayoutProfile = useLayoutStore((s) => s.resetLayoutProfile);
  const copyLayoutFromDevice = useLayoutStore((s) => s.copyLayoutFromDevice);
  const updateSplitSizes = useLayoutStore((s) => s.updateSplitSizes);
  const setTabsActive = useLayoutStore((s) => s.setTabsActive);

  const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null);
  const [dragHover, setDragHover] = useState<{ path: number[]; edge?: SplitEdge } | null>(null);
  const [layoutEpoch, setLayoutEpoch] = useState(0);

  const previewRootRef = useRef<HTMLDivElement>(null);
  const activeDragRef = useRef<ActiveDragState | null>(null);
  const draftTreeRef = useRef<LayoutNode | null>(null);
  const dragHoverRef = useRef<{ path: number[]; edge?: SplitEdge } | null>(null);
  const dropHandledRef = useRef(false);
  const lastPointerRef = useRef({ clientX: 0, clientY: 0 });
  const lastValidHoverRef = useRef<{ path: number[]; edge?: SplitEdge } | null>(null);
  const panelRectCacheRef = useRef<PanelRectCache>(null);

  useEffect(() => {
    if (!editorDraft) beginLayoutEdit(editorDevice);
  }, [editorDraft, beginLayoutEdit, editorDevice]);

  const editorTree = editorDraft?.[editorDevice] ?? layoutProfiles[editorDevice];
  draftTreeRef.current = editorTree;

  const layoutValidationError = useMemo(
    () => (editorDraft ? validateLayoutProfiles(editorDraft) : null),
    [editorDraft],
  );

  const clearDrag = useCallback(() => {
    activeDragRef.current = null;
    dragHoverRef.current = null;
    panelRectCacheRef.current = null;
    lastValidHoverRef.current = null;
    setActiveDrag(null);
    setDragHover(null);
    onDragActivityChange?.(false);
  }, [onDragActivityChange]);

  const beginDrag = useCallback(
    (drag: ActiveDragState, point?: DragHoverPoint) => {
      dropHandledRef.current = false;
      lastValidHoverRef.current = null;
      activeDragRef.current = drag;
      setActiveDrag(drag);
      if (point) lastPointerRef.current = point;
      onDragActivityChange?.(true);
    },
    [onDragActivityChange],
  );

  const updateHover = useCallback(
    (path: number[] | null, edge?: SplitEdge, point?: DragHoverPoint) => {
      const tree = draftTreeRef.current;
      if (!tree || !path) {
        dragHoverRef.current = null;
        setDragHover(null);
        return;
      }
      if (point) lastPointerRef.current = point;
      const noSplitEdge = collapseDragDisallowsSplitEdge(activeDragRef.current);
      const resolved = resolveDragHover(
        tree,
        path,
        noSplitEdge ? undefined : edge,
        dragHoverRef.current,
        point,
        previewRootRef.current,
        noSplitEdge ? undefined : panelRectCacheRef,
      );
      const stable = stabilizeDragHover(
        dragHoverRef.current,
        resolved.path,
        noSplitEdge ? undefined : resolved.edge,
      );
      dragHoverRef.current = stable;
      lastValidHoverRef.current = stable;
      setDragHover(stable);
    },
    [],
  );

  const applyPreviewDrop = useCallback(
    (targetPath: number[], edge?: SplitEdge, drag = activeDragRef.current) => {
      const tree = draftTreeRef.current;
      if (!tree || !drag) return false;

      let next = tree;
      switch (drag.kind) {
        case 'palette':
          next = dropModuleOnTarget(tree, targetPath, drag.moduleId, edge);
          break;
        case 'container':
          next = moveContainerInTree(tree, drag.fromPath, targetPath, edge);
          break;
        case 'tab':
          next = moveTabToTarget(tree, drag.fromPath, drag.tabId, targetPath, edge);
          break;
        case 'collapse-palette': {
          if (edge) break;
          const target = getNodeAtPath(tree, targetPath);
          if (
            target?.type === 'module' ||
            target?.type === 'tabs' ||
            target?.type === 'split'
          ) {
            const assignPath = resolveCollapseAssignmentPath(tree, targetPath);
            next = setPanelCollapseAtPath(tree, assignPath, drag.direction);
          }
          break;
        }
      }

      if (next !== tree) {
        updateEditorDraft(editorDevice, next);
        setLayoutEpoch((n) => n + 1);
      }
      dropHandledRef.current = true;
      clearDrag();
      return true;
    },
    [clearDrag, editorDevice, updateEditorDraft],
  );

  const removeActiveDragFromDraft = useCallback(
    (drag: ActiveDragState) => {
      if (drag.kind === 'palette' || drag.kind === 'collapse-palette') return;
      const tree = draftTreeRef.current;
      if (!tree) return;

      let next: LayoutNode = tree;
      if (drag.kind === 'container') {
        const node = getNodeAtPath(tree, drag.fromPath);
        if (!node) return;
        next = coalesceRemovedLayout(removeNodeAtPath(tree, drag.fromPath));
      } else if (drag.kind === 'collapse-attached') {
        next = setPanelCollapseAtPath(tree, drag.fromPath, undefined);
      } else if (drag.kind === 'tab') {
        const node = getNodeAtPath(tree, drag.fromPath);
        if (!node || node.type !== 'tabs') return;
        const tab = node.tabs.find((t) => t.id === drag.tabId);
        if (!tab) return;
        next = removeTabFromGroup(tree, drag.fromPath, drag.tabId);
      }

      if (next !== tree) {
        updateEditorDraft(editorDevice, next);
        setLayoutEpoch((n) => n + 1);
      }
    },
    [editorDevice, updateEditorDraft],
  );

  const commitDropAtPointer = useCallback(
    (clientX: number, clientY: number, drag: ActiveDragState) => {
      const previewRoot = previewRootRef.current;
      if (!previewRoot) return;

      if (!isPointerInPreviewBounds(previewRoot, clientX, clientY)) {
        removeActiveDragFromDraft(drag);
        dropHandledRef.current = true;
        clearDrag();
        return;
      }

      const hover = dragHoverRef.current ?? lastValidHoverRef.current;
      const noSplitEdge = collapseDragDisallowsSplitEdge(drag);
      const hit = findDropTargetFromPoint(
        previewRoot,
        clientX,
        clientY,
        noSplitEdge ? undefined : hover?.edge,
      );
      const targetPath = hover?.path ?? hit?.path;
      const targetEdge = noSplitEdge ? undefined : (hover?.edge ?? hit?.edge);

      if (targetPath != null) {
        applyPreviewDrop(targetPath, targetEdge, drag);
        return;
      }

      dropHandledRef.current = true;
      clearDrag();
    },
    [applyPreviewDrop, clearDrag, removeActiveDragFromDraft],
  );

  const finishLayoutDrag = useCallback(() => {
    const drag = activeDragRef.current;
    if (!drag) {
      clearDrag();
      return;
    }

    if (dropHandledRef.current) {
      clearDrag();
      return;
    }

    const { clientX, clientY } = lastPointerRef.current;
    commitDropAtPointer(clientX, clientY, drag);
  }, [clearDrag, commitDropAtPointer]);

  const handleDrop = (targetPath: number[], e: React.DragEvent, edge?: SplitEdge) => {
    e.preventDefault();
    const drag = activeDragRef.current ?? readActiveDragFromEvent(e);
    if (!drag) return;
    const hover = dragHoverRef.current;
    const effectivePath = hover?.path ?? targetPath;
    const effectiveEdge = collapseDragDisallowsSplitEdge(drag)
      ? undefined
      : (hover?.edge ?? edge);
    applyPreviewDrop(effectivePath, effectiveEdge, drag);
  };

  const handlePaletteDragStart = (moduleId: ModuleId) => (e: React.DragEvent) => {
    attachPaletteDragImage(e, MODULE_LABELS[moduleId]);
    e.dataTransfer.setData(LAYOUT_MODULE_DRAG_TYPE, moduleId);
    e.dataTransfer.setData('text/plain', moduleId);
    e.dataTransfer.effectAllowed = 'copy';
    beginDrag({ kind: 'palette', moduleId }, { clientX: e.clientX, clientY: e.clientY });
  };

  const handleCollapsePaletteDragStart =
    (direction: CollapseDirection) => (e: React.DragEvent) => {
      attachPaletteDragImage(e, COLLAPSE_LABELS[direction]);
      e.dataTransfer.setData(
        LAYOUT_COLLAPSE_DRAG_TYPE,
        encodeCollapseDrag({ kind: 'palette', direction }),
      );
      e.dataTransfer.effectAllowed = 'move';
      beginDrag({ kind: 'collapse-palette', direction }, { clientX: e.clientX, clientY: e.clientY });
    };

  const handleCollapseAttachedDragStart = (fromPath: number[]) => (e: React.DragEvent) => {
    e.stopPropagation();
    const node = getNodeAtPath(draftTreeRef.current ?? editorTree, fromPath);
    const collapseDir = node ? getPanelCollapse(node) : undefined;
    const label =
      node && collapseDir ? COLLAPSE_LABELS[collapseDir] : 'Collapse';
    attachPaletteDragImage(e, label);
    e.dataTransfer.setData(
      LAYOUT_COLLAPSE_DRAG_TYPE,
      encodeCollapseDrag({ kind: 'attached', fromPath }),
    );
    e.dataTransfer.effectAllowed = 'move';
    beginDrag({ kind: 'collapse-attached', fromPath }, { clientX: e.clientX, clientY: e.clientY });
  };

  useEffect(() => {
    if (!activeDrag) return;

    const previewRoot = previewRootRef.current;
    const onPreviewDragOver = (e: DragEvent) => {
      if (!previewRoot || !isPointerInPreviewBounds(previewRoot, e.clientX, e.clientY)) return;
      e.preventDefault();
    };
    previewRoot?.addEventListener('dragover', onPreviewDragOver);

    const onPreviewDropCapture = (e: DragEvent) => {
      if (dropHandledRef.current) return;
      if (!previewRoot || !isPointerInPreviewBounds(previewRoot, e.clientX, e.clientY)) return;
      e.preventDefault();
      lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
      const drag = activeDragRef.current ?? readActiveDragFromEvent(e);
      if (!drag) return;
      commitDropAtPointer(e.clientX, e.clientY, drag);
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
      const previewRoot = previewRootRef.current;
      if (previewRoot && !isPointerInPreviewBounds(previewRoot, e.clientX, e.clientY)) {
        dragHoverRef.current = null;
        setDragHover(null);
      }
      if (e.dataTransfer) {
        const kind = activeDragRef.current?.kind;
        e.dataTransfer.dropEffect = kind === 'palette' ? 'copy' : 'move';
      }
    };

    const onDrop = (e: DragEvent) => {
      if (dropHandledRef.current) return;
      e.preventDefault();
      lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
      const drag = activeDragRef.current ?? readActiveDragFromEvent(e);
      if (!drag) {
        clearDrag();
        return;
      }
      commitDropAtPointer(e.clientX, e.clientY, drag);
    };

    previewRoot?.addEventListener('drop', onPreviewDropCapture, true);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      previewRoot?.removeEventListener('dragover', onPreviewDragOver);
      previewRoot?.removeEventListener('drop', onPreviewDropCapture, true);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [activeDrag, clearDrag, commitDropAtPointer]);

  const { tree: displayTree, ghostPath, dropTargetPath } = computeDragPreviewDisplayTree(
    editorTree,
    activeDrag,
    dragHover,
  );
  const previewLayoutKey = `${editorDevice}:${layoutEpoch}`;
  const appSurface = useAppLayoutSurfaceSize();

  const handleReset = () => {
    resetLayoutProfile(editorDevice);
    setLayoutEpoch((n) => n + 1);
    clearDrag();
  };

  const handleApply = () => {
    if (!applyEditorDraft()) return;
    setLayoutEpoch((n) => n + 1);
    clearDrag();
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden md:flex-row md:gap-3">
      <aside className="flex max-h-[40%] shrink-0 flex-col gap-3 overflow-y-auto overscroll-contain border-b border-slate-700/80 pb-2 md:max-h-none md:w-72 md:shrink-0 md:border-b-0 md:border-r md:pb-0 md:pr-3">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-200">Layout</h3>
          <p className="text-xs text-slate-400">
            Preview matches the live app aspect ratio. Drag modules from the palette, drop on an edge to
            split or center to merge as tabs. Drag panels outside the preview to remove.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                editorDevice === d.id ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'
              }`}
              onClick={() => setEditorDevice(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {MODULE_IDS.map((moduleId) => {
            const isDragging = activeDrag?.kind === 'palette' && activeDrag.moduleId === moduleId;
            return (
              <span
                key={moduleId}
                draggable
                onDragStart={handlePaletteDragStart(moduleId)}
                onDragEnd={finishLayoutDrag}
                className={`cursor-grab rounded-full border px-3 py-1 text-xs transition-all duration-200 active:cursor-grabbing ${
                  isDragging
                    ? 'scale-90 border-sky-300/50 bg-sky-500/10 text-sky-100/40 opacity-30'
                    : 'border-slate-600 bg-slate-800 text-slate-200'
                }`}
              >
                {MODULE_LABELS[moduleId]}
              </span>
            );
          })}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Panel collapse
          </span>
          <div className="flex flex-wrap gap-2">
            {COLLAPSE_DIRECTIONS.map((direction) => {
              const isDragging =
                activeDrag?.kind === 'collapse-palette' && activeDrag.direction === direction;
              return (
                <span
                  key={direction}
                  draggable
                  onDragStart={handleCollapsePaletteDragStart(direction)}
                  onDragEnd={finishLayoutDrag}
                  title={COLLAPSE_LABELS[direction]}
                  className={`flex h-8 w-8 cursor-grab items-center justify-center rounded-lg border text-sm font-semibold transition-all active:cursor-grabbing ${
                    isDragging
                      ? 'scale-90 border-sky-300/50 bg-sky-500/10 text-sky-100/40 opacity-30'
                      : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500'
                  }`}
                >
                  {COLLAPSE_ARROWS[direction]}
                </span>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500">
            Drop on a panel center to assign. Drag the badge off the preview to remove.
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <button
            type="button"
            className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-750"
            onClick={handleReset}
          >
            Reset {editorDevice}
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-750"
            onClick={() => {
              copyLayoutFromDevice('desktop', editorDevice);
              setLayoutEpoch((n) => n + 1);
            }}
          >
            Copy from desktop
          </button>
          <button
            type="button"
            className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleApply}
            disabled={layoutValidationError != null}
            title={layoutValidationError ?? undefined}
          >
            Apply layout
          </button>
          {layoutValidationError && (
            <p className="text-xs text-amber-400">{layoutValidationError}</p>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {appSurface.width > 0 && appSurface.height > 0 && (
          <p className="mb-1 shrink-0 text-center text-[10px] text-slate-500">
            App {appSurface.width}×{appSurface.height}
            {appSurface.width === appSurface.height
              ? ' (1∶1)'
              : ` (${(appSurface.width / appSurface.height).toFixed(2)}∶1)`}{' '}
            — preview scaled to fit
          </p>
        )}
        <LayoutPreviewViewport className="min-h-0 flex-1 rounded-xl border border-slate-700">
          <div
            ref={previewRootRef}
            data-layout-preview
            className="flex h-full w-full flex-col overflow-hidden p-1"
          >
            <LayoutEditorZones
              node={displayTree}
              layoutKey={previewLayoutKey}
              previewLocked={false}
              onSplitResize={(path, sizes) => updateSplitSizes(editorDevice, path, sizes)}
              onDrop={handleDrop}
              onDragHover={updateHover}
              onContainerDragStart={(fromPath, point) =>
                beginDrag({ kind: 'container', fromPath }, point)
              }
              onTabDragStart={(fromPath, tabId, point) =>
                beginDrag({ kind: 'tab', fromPath, tabId }, point)
              }
              onCollapseAttachedDragStart={handleCollapseAttachedDragStart}
              onDragEnd={finishLayoutDrag}
              onTabSelect={(path, tabId) => setTabsActive(editorDevice, path, tabId)}
              onTabMove={(fromPath, tabId, toPath) => {
                const next = moveTabToTarget(editorTree, fromPath, tabId, toPath);
                updateEditorDraft(editorDevice, next);
              }}
              ghostPath={ghostPath}
              dropTargetPath={dropTargetPath}
              hoverEdge={dragHover?.edge}
              activeDrag={activeDrag}
              acceptPreviewPointer={(clientX, clientY) =>
                isPointerInPreviewBounds(previewRootRef.current, clientX, clientY)
              }
            />
          </div>
        </LayoutPreviewViewport>
      </div>
    </section>
  );
}
