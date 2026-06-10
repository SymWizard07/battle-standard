import type {
  CollapseDirection,
  LayoutNode,
  LayoutTab,
  ModuleId,
  ModuleLayoutNode,
  SplitLayoutNode,
  TabsLayoutNode,
} from './schema/layoutSchema';
import {
  MODULE_LABELS,
  collapseTabsIfAlone,
  createEmptyEditorLayout,
  isModuleId,
  repairLayoutTree,
} from './schema/layoutSchema';

export type LayoutPath = number[];

export function coalesceRemovedLayout(result: LayoutNode | null): LayoutNode {
  return result ?? createEmptyEditorLayout();
}

export function getNodeAtPath(root: LayoutNode, path: LayoutPath): LayoutNode | null {
  if (root.type === 'empty' && path.length > 0) return null;
  let node: LayoutNode = root;
  for (const idx of path) {
    if (node.type !== 'split') return null;
    const child = node.children[idx];
    if (!child) return null;
    node = child;
  }
  return node;
}

export function updateNodeAtPath(
  root: LayoutNode,
  path: LayoutPath,
  updater: (node: LayoutNode) => LayoutNode,
): LayoutNode {
  if (path.length === 0) return updater(root);
  if (root.type !== 'split') return root;
  const [head, ...rest] = path;
  const children = root.children.map((child, i) =>
    i === head ? updateNodeAtPath(child, rest, updater) : child,
  );
  return { ...root, children };
}

export function updateSplitSizes(root: LayoutNode, path: LayoutPath, sizes: number[]): LayoutNode {
  return updateNodeAtPath(root, path, (node) => {
    if (node.type !== 'split') return node;
    return { ...node, sizes: [...sizes] };
  });
}

export function setTabsActive(root: LayoutNode, path: LayoutPath, activeTabId: string): LayoutNode {
  return updateNodeAtPath(root, path, (node) => {
    if (node.type !== 'tabs') return node;
    return { ...node, activeTabId };
  });
}

export function addModuleAsTab(
  root: LayoutNode,
  path: LayoutPath,
  moduleId: ModuleId,
): LayoutNode {
  return updateNodeAtPath(root, path, (node) => {
    if (node.type === 'tabs') {
      const tabId = `tab-${moduleId}-${Date.now()}`;
      const tab: LayoutTab = {
        id: tabId,
        moduleId,
        title: MODULE_LABELS[moduleId],
      };
      return {
        ...node,
        tabs: [...node.tabs, tab],
        activeTabId: tabId,
      };
    }
    if (node.type === 'module' || node.type === 'playArea') {
      const existingModuleId = node.type === 'module' ? node.moduleId : 'canvas';
      const tabs: TabsLayoutNode = {
        type: 'tabs',
        id: `tabs-${Date.now()}`,
        activeTabId: `tab-new-${moduleId}`,
        tabs: [
          {
            id: `tab-existing-${existingModuleId}`,
            moduleId: existingModuleId === 'canvas' ? 'canvas' : existingModuleId,
            title: MODULE_LABELS[existingModuleId === 'canvas' ? 'canvas' : existingModuleId],
          },
          {
            id: `tab-new-${moduleId}`,
            moduleId,
            title: MODULE_LABELS[moduleId],
          },
        ],
      };
      if (node.type === 'playArea') {
        tabs.tabs[0] = { id: 'tab-canvas', moduleId: 'canvas', title: 'Play area' };
      }
      return tabs;
    }
    return node;
  });
}

export function moveTabBetweenGroups(
  root: LayoutNode,
  fromPath: LayoutPath,
  tabId: string,
  toPath: LayoutPath,
): LayoutNode {
  const fromNode = getNodeAtPath(root, fromPath);
  if (!fromNode || fromNode.type !== 'tabs') return root;
  const tab = fromNode.tabs.find((t) => t.id === tabId);
  if (!tab) return root;

  const remainingTabs = fromNode.tabs.filter((t) => t.id !== tabId);
  let next: LayoutNode;
  if (remainingTabs.length === 0) {
    next = removeNodeAtPath(root, fromPath) ?? root;
  } else {
    const activeTabId = remainingTabs.some((t) => t.id === fromNode.activeTabId)
      ? fromNode.activeTabId
      : remainingTabs[0]!.id;
    next = updateNodeAtPath(root, fromPath, (node) => {
      if (node.type !== 'tabs') return node;
      return collapseTabsIfAlone({ ...node, tabs: remainingTabs, activeTabId });
    });
  }

  next = updateNodeAtPath(next, toPath, (node) => {
    if (node.type === 'tabs') {
      if (node.tabs.some((t) => t.id === tab.id)) return node;
      return {
        ...node,
        tabs: [...node.tabs, tab],
        activeTabId: tab.id,
      };
    }
    return addModuleAsTab(node, [], tab.moduleId) as LayoutNode;
  });

  return next;
}

export function removeTabFromGroup(
  root: LayoutNode,
  fromPath: LayoutPath,
  tabId: string,
): LayoutNode {
  const fromNode = getNodeAtPath(root, fromPath);
  if (!fromNode || fromNode.type !== 'tabs') return root;

  const remainingTabs = fromNode.tabs.filter((t) => t.id !== tabId);
  if (remainingTabs.length === 0) {
    return coalesceRemovedLayout(removeNodeAtPath(root, fromPath));
  }

  const activeTabId = remainingTabs.some((t) => t.id === fromNode.activeTabId)
    ? fromNode.activeTabId
    : remainingTabs[0]!.id;

  return updateNodeAtPath(root, fromPath, (node) => {
    if (node.type !== 'tabs') return node;
    return collapseTabsIfAlone({ ...node, tabs: remainingTabs, activeTabId });
  });
}

export function replaceModuleAtPath(
  root: LayoutNode,
  path: LayoutPath,
  moduleId: ModuleId,
): LayoutNode {
  return updateNodeAtPath(root, path, (node) => {
    if (node.type === 'module') {
      return { ...node, moduleId };
    }
    return node;
  });
}

export function collectDropTargets(
  root: LayoutNode,
  path: LayoutPath = [],
): { path: LayoutPath; kind: 'split' | 'tabs' | 'module' | 'playArea' | 'empty' }[] {
  const results: { path: LayoutPath; kind: 'split' | 'tabs' | 'module' | 'playArea' | 'empty' }[] = [];
  const kind =
    root.type === 'split' ? 'split' : root.type === 'empty' ? 'empty' : root.type;
  results.push({ path, kind });

  if (root.type === 'split') {
    root.children.forEach((child, i) => {
      results.push(...collectDropTargets(child, [...path, i]));
    });
  }
  return results;
}

export function normalizeSplitSizes(node: SplitLayoutNode): SplitLayoutNode {
  const total = node.sizes.reduce((a, b) => a + b, 0) || 1;
  return {
    ...node,
    sizes: node.sizes.map((s) => (s / total) * 100),
  };
}

export function parseModuleDragData(data: string): ModuleId | null {
  if (!isModuleId(data)) return null;
  return data;
}

export type SplitEdge = 'left' | 'right' | 'top' | 'bottom';

const EDGE_ENTER = 0.17;
/** When already edge-splitting, keep edge until pointer leaves this band. */
const EDGE_HOLD = 0.26;
/** Center zone that merges as a tab (no active edge). */
const MERGE_ENTER = 0.28;
/** When edge-splitting, must reach this deeper center to switch back to merge. */
const MERGE_DEEP = 0.38;
/** Width/height above this → bar panel (splits only on left/right). Below 1/ratio → column panel. */
const BAR_ASPECT_RATIO = 2.5;

export type PanelRectCache = { pathKey: string; rect: DOMRect } | null;

function splitEdgesForRect(rect: DOMRect): Set<SplitEdge> | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const aspect = rect.width / rect.height;
  if (aspect >= BAR_ASPECT_RATIO) return new Set(['left', 'right']);
  if (aspect <= 1 / BAR_ASPECT_RATIO) return new Set(['top', 'bottom']);
  return null;
}

function coerceSplitEdge(edge: SplitEdge | undefined, allowed: Set<SplitEdge> | null): SplitEdge | undefined {
  if (!edge || !allowed) return edge;
  return allowed.has(edge) ? edge : undefined;
}

function closestSplitEdge(x: number, y: number, allowed: Set<SplitEdge> | null = null): SplitEdge | undefined {
  const options: { edge: SplitEdge; dist: number }[] = [
    { edge: 'left', dist: x },
    { edge: 'right', dist: 1 - x },
    { edge: 'top', dist: y },
    { edge: 'bottom', dist: 1 - y },
  ];
  const filtered = allowed ? options.filter((o) => allowed.has(o.edge)) : options;
  if (filtered.length === 0) return undefined;
  filtered.sort((a, b) => a.dist - b.dist);
  return filtered[0]!.edge;
}

function inInset(x: number, y: number, inset: number): boolean {
  return x >= inset && x <= 1 - inset && y >= inset && y <= 1 - inset;
}

function hitEdgeBand(x: number, y: number, margin: number): SplitEdge | null {
  if (x < margin) return 'left';
  if (x > 1 - margin) return 'right';
  if (y < margin) return 'top';
  if (y > 1 - margin) return 'bottom';
  return null;
}

function detectSplitEdgeFromRect(
  rect: DOMRect,
  clientX: number,
  clientY: number,
  activeEdge?: SplitEdge,
): SplitEdge | undefined {
  if (rect.width <= 0 || rect.height <= 0) {
    return coerceSplitEdge(activeEdge, splitEdgesForRect(rect));
  }

  const allowed = splitEdgesForRect(rect);
  const sticky = coerceSplitEdge(activeEdge, allowed);
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;

  if (sticky) {
    const held = hitEdgeBand(x, y, EDGE_HOLD);
    if (held === sticky) return coerceSplitEdge(sticky, allowed);
    if (inInset(x, y, MERGE_DEEP)) return undefined;
    if (held) return coerceSplitEdge(held, allowed);
    return coerceSplitEdge(closestSplitEdge(x, y, allowed), allowed) ?? sticky;
  }

  if (inInset(x, y, MERGE_ENTER)) return undefined;

  const entering = hitEdgeBand(x, y, EDGE_ENTER);
  if (entering) return coerceSplitEdge(entering, allowed);

  return undefined;
}

function findCommittedPathElement(previewRoot: HTMLElement, pathKey: string): HTMLElement | null {
  const parts = pathKey === '' ? [] : pathKey.split('.');
  while (true) {
    const key = parts.join('.');
    const el = previewRoot.querySelector(`[data-committed-path="${key}"]`);
    if (el instanceof HTMLElement) return el;
    if (parts.length === 0) break;
    parts.pop();
  }
  return null;
}

/** Detect which edge of `el` the pointer is near; center core merges as a tab. */
export function detectSplitEdge(
  el: HTMLElement,
  clientX: number,
  clientY: number,
  activeEdge?: SplitEdge,
): SplitEdge | undefined {
  return detectSplitEdgeFromRect(el.getBoundingClientRect(), clientX, clientY, activeEdge);
}

export type DragHoverPoint = { clientX: number; clientY: number };

export function insertModuleAtEdge(
  root: LayoutNode,
  targetPath: LayoutPath,
  edge: SplitEdge,
  moduleId: ModuleId,
): LayoutNode {
  const target = getNodeAtPath(root, targetPath);
  if (!target) return root;

  const direction: SplitLayoutNode['direction'] =
    edge === 'left' || edge === 'right' ? 'row' : 'col';
  const moduleNode: LayoutNode = {
    type: 'module',
    id: `mod-${moduleId}-${Date.now()}`,
    moduleId,
  };
  const children =
    edge === 'left' || edge === 'top' ? [moduleNode, target] : [target, moduleNode];
  const sizes = [28, 72];

  const split: SplitLayoutNode = {
    type: 'split',
    id: `split-${Date.now()}`,
    direction,
    sizes,
    children,
  };

  if (targetPath.length === 0) return split;

  const parentPath = targetPath.slice(0, -1);
  const childIndex = targetPath[targetPath.length - 1]!;
  return updateNodeAtPath(root, parentPath, (parent) => {
    if (parent.type !== 'split') return parent;
    const newChildren = parent.children.map((c, i) => (i === childIndex ? split : c));
    return { ...parent, children: newChildren };
  });
}

function moduleNodeFromId(moduleId: ModuleId): LayoutNode {
  return {
    type: 'module',
    id: `mod-${moduleId}-${Date.now()}`,
    moduleId,
  };
}

export function dropModuleOnTarget(
  root: LayoutNode,
  targetPath: LayoutPath,
  moduleId: ModuleId,
  edge?: SplitEdge,
): LayoutNode {
  if (root.type === 'empty') {
    return moduleNodeFromId(moduleId);
  }
  if (edge) return insertModuleAtEdge(root, targetPath, edge, moduleId);
  return addModuleAsTab(root, targetPath, moduleId);
}

export function isPlayAreaLayoutNode(node: LayoutNode): boolean {
  return node.type === 'playArea' || (node.type === 'module' && node.moduleId === 'canvas');
}

export function getNodeLabel(node: LayoutNode): string {
  if (node.type === 'empty') return 'Drop modules here';
  if (node.type === 'playArea') return MODULE_LABELS.canvas;
  if (node.type === 'module') return MODULE_LABELS[node.moduleId];
  if (node.type === 'tabs') {
    return node.tabs.map((t) => t.title).join(' · ');
  }
  return 'Region';
}

export function findPlayAreaPath(root: LayoutNode, path: LayoutPath = []): LayoutPath | null {
  if (root.type === 'playArea') return path;
  if (root.type === 'module' && root.moduleId === 'canvas') return path;
  if (root.type === 'split') {
    for (let i = 0; i < root.children.length; i++) {
      const found = findPlayAreaPath(root.children[i]!, [...path, i]);
      if (found) return found;
    }
  }
  if (root.type === 'tabs') {
    for (const tab of root.tabs) {
      if (tab.moduleId === 'canvas') return path;
    }
  }
  return null;
}

function pathsEqual(a: LayoutPath, b: LayoutPath): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function isPrefixPath(prefix: LayoutPath, path: LayoutPath): boolean {
  if (prefix.length > path.length) return false;
  return prefix.every((v, i) => v === path[i]);
}

/** Adjust a path after removing a node at `removedPath`. */
export function adjustPathAfterRemoval(path: LayoutPath, removedPath: LayoutPath): LayoutPath {
  if (removedPath.length === 0) return path;
  const sharedParent = removedPath.length <= path.length;
  if (!sharedParent) return path;

  for (let i = 0; i < removedPath.length - 1; i++) {
    if (path[i] !== removedPath[i]) return path;
  }

  const removedIndex = removedPath[removedPath.length - 1]!;
  const pathIndex = path[removedPath.length - 1];
  if (pathIndex === undefined) return path;

  if (path.length === removedPath.length) {
    if (pathsEqual(path, removedPath)) return path;
  }

  const next = [...path];
  if (path.length >= removedPath.length && pathIndex > removedIndex) {
    next[removedPath.length - 1] = pathIndex - 1;
  }
  return next;
}

/** Map a pre-removal target path onto the tree after `removedPath` was deleted (handles split collapse). */
export function resolveTargetPathAfterRemoval(
  root: LayoutNode,
  targetPath: LayoutPath,
  removedPath: LayoutPath,
): LayoutPath {
  let candidate = adjustPathAfterRemoval(targetPath, removedPath);
  while (candidate.length > 0 && getNodeAtPath(root, candidate) == null) {
    candidate = candidate.slice(0, -1);
  }
  if (getNodeAtPath(root, candidate) != null) return candidate;
  if (getNodeAtPath(root, []) != null) return [];
  return candidate;
}

function normalizeSizes(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return sizes.map((s) => (s / total) * 100);
}

/** Give a removed panel's size to the largest remaining sibling so content expands to fill. */
function redistributeSizesAfterRemoval(sizes: number[], removedIndex: number): number[] {
  const removed = sizes[removedIndex] ?? 0;
  const next = sizes.filter((_, i) => i !== removedIndex);
  if (next.length === 0) return [];
  let targetIdx = 0;
  for (let i = 1; i < next.length; i++) {
    if (next[i]! > next[targetIdx]!) targetIdx = i;
  }
  next[targetIdx] = (next[targetIdx] ?? 0) + removed;
  return normalizeSizes(next);
}

export function normalizeLayoutSplitSizes(root: LayoutNode): LayoutNode {
  if (root.type === 'empty') return root;
  if (root.type === 'split') {
    const children = root.children.map(normalizeLayoutSplitSizes);
    if (children.length === 1) return children[0]!;
    return {
      ...root,
      children,
      sizes: normalizeSizes(
        root.sizes.length === children.length
          ? root.sizes
          : children.map(() => 100 / Math.max(children.length, 1)),
      ),
    };
  }
  if (root.type === 'tabs') return root;
  return root;
}

/** Percentage for a panel in a split group (100 when it is the only child). */
export function panelSizeInSplit(
  sizes: number[],
  childIndex: number,
  childCount: number,
): number {
  if (childCount <= 1) return 100;
  return sizes[childIndex] ?? 100 / childCount;
}

type DefaultSplitLayoutOptions = {
  /** When true, panels with collapse controls mount at 0% (stored sizes stay expanded for restore). */
  startCollapsedPanels?: boolean;
};

/**
 * Build react-resizable-panels defaultLayout from the layout tree.
 * By default uses stored sizes; pass startCollapsedPanels: true only when a 0% mount is required.
 */
export function buildDefaultSplitLayout(
  children: LayoutNode[],
  sizes: number[],
  options: DefaultSplitLayoutOptions = {},
): Record<string, number> {
  const startCollapsed = options.startCollapsedPanels ?? false;
  const count = children.length;
  if (count === 0) return {};
  if (count === 1) {
    const child = children[0]!;
    return { [child.id]: 100 };
  }

  const raw = children.map((child, i) => {
    const stored = panelSizeInSplit(sizes, i, count);
    if (
      startCollapsed &&
      (child.type === 'module' || child.type === 'tabs') &&
      child.collapse
    ) {
      return 0;
    }
    return stored;
  });

  const normalized = normalizeSizes(raw);
  return Object.fromEntries(children.map((child, i) => [child.id, normalized[i]!]));
}

export function removeNodeAtPath(root: LayoutNode, path: LayoutPath): LayoutNode | null {
  if (path.length === 0) return null;

  if (path.length === 1) {
    if (root.type !== 'split') return root;
    const removeIndex = path[0]!;
    const children = root.children.filter((_, i) => i !== removeIndex);
    if (children.length === 0) return null;
    if (children.length === 1) return normalizeLayoutSplitSizes(children[0]!);
    const sizes = redistributeSizesAfterRemoval(root.sizes, removeIndex);
    return normalizeLayoutSplitSizes({ ...root, children, sizes });
  }

  if (root.type !== 'split') return root;
  const [head, ...rest] = path;
  const child = root.children[head];
  if (!child) return root;
  const updatedChild = removeNodeAtPath(child, rest);
  if (updatedChild === null) {
    return removeNodeAtPath(root, [head]);
  }
  const children = root.children.map((c, i) => (i === head ? updatedChild : c));
  return normalizeLayoutSplitSizes({ ...root, children });
}

export function insertNodeAtEdge(
  root: LayoutNode,
  targetPath: LayoutPath,
  edge: SplitEdge,
  inserted: LayoutNode,
): LayoutNode {
  const target = getNodeAtPath(root, targetPath);
  if (!target) return root;

  const direction: SplitLayoutNode['direction'] =
    edge === 'left' || edge === 'right' ? 'row' : 'col';
  const children =
    edge === 'left' || edge === 'top' ? [inserted, target] : [target, inserted];
  const sizes = [28, 72];

  const split: SplitLayoutNode = {
    type: 'split',
    id: `split-${Date.now()}`,
    direction,
    sizes,
    children,
  };

  if (targetPath.length === 0) return split;

  const parentPath = targetPath.slice(0, -1);
  const childIndex = targetPath[targetPath.length - 1]!;
  return updateNodeAtPath(root, parentPath, (parent) => {
    if (parent.type !== 'split') return parent;
    const newChildren = parent.children.map((c, i) => (i === childIndex ? split : c));
    return { ...parent, children: newChildren };
  });
}

function layoutNodeToTabs(node: LayoutNode): LayoutTab[] {
  if (node.type === 'tabs') return node.tabs;
  if (node.type === 'module') {
    return [
      {
        id: `tab-${node.moduleId}-${Date.now()}`,
        moduleId: node.moduleId,
        title: MODULE_LABELS[node.moduleId],
      },
    ];
  }
  if (node.type === 'playArea') {
    return [
      {
        id: `tab-canvas-${Date.now()}`,
        moduleId: 'canvas',
        title: MODULE_LABELS.canvas,
      },
    ];
  }
  return [];
}

/** Merge a panel or tab group onto another, keeping the destination's modules and adding the rest. */
function combineLayoutNodesAsTabs(target: LayoutNode, incoming: LayoutNode): TabsLayoutNode {
  const targetTabs = layoutNodeToTabs(target);
  const incomingTabs = layoutNodeToTabs(incoming);
  const preferredActiveId = incoming.type === 'tabs' ? incoming.activeTabId : undefined;

  const tabs: LayoutTab[] = [];
  let mappedActiveId: string | undefined;

  for (const tab of [...targetTabs, ...incomingTabs]) {
    const newId = `tab-${tab.moduleId}-${Date.now()}-${tabs.length}`;
    if (preferredActiveId != null && tab.id === preferredActiveId) {
      mappedActiveId = newId;
    }
    tabs.push({ ...tab, id: newId });
  }

  const activeTabId = mappedActiveId ?? tabs[tabs.length - 1]?.id ?? tabs[0]?.id ?? '';
  const id =
    target.type === 'tabs'
      ? target.id
      : incoming.type === 'tabs'
        ? incoming.id
        : `tabs-${Date.now()}`;

  const collapse =
    (target.type === 'tabs' || target.type === 'module' ? target.collapse : undefined) ??
    (incoming.type === 'tabs' || incoming.type === 'module' ? incoming.collapse : undefined);

  return collapse != null
    ? { type: 'tabs', id, tabs, activeTabId, collapse }
    : { type: 'tabs', id, tabs, activeTabId };
}

function mergeNodeAtTarget(root: LayoutNode, targetPath: LayoutPath, node: LayoutNode): LayoutNode {
  return updateNodeAtPath(root, targetPath, (target) => {
    const canMergeTarget =
      target.type === 'tabs' || target.type === 'module' || target.type === 'playArea';
    const canMergeIncoming =
      node.type === 'tabs' || node.type === 'module' || node.type === 'playArea';

    if (canMergeTarget && canMergeIncoming) {
      return combineLayoutNodesAsTabs(target, node);
    }
    return target;
  });
}

export function movePlayAreaToTarget(
  root: LayoutNode,
  targetPath: LayoutPath,
  edge?: SplitEdge,
): LayoutNode {
  const playPath = findPlayAreaPath(root);
  const playNode: LayoutNode = playPath
    ? (getNodeAtPath(root, playPath) ?? { type: 'playArea', id: `play-area-${Date.now()}` })
    : { type: 'playArea', id: `play-area-${Date.now()}` };

  const normalizedPlay =
    playNode.type === 'module' && playNode.moduleId === 'canvas'
      ? ({ type: 'playArea', id: playNode.id } as LayoutNode)
      : playNode;

  if (playPath && pathsEqual(playPath, targetPath)) return root;

  let without = playPath ? removeNodeAtPath(root, playPath) : root;
  if (!without) without = root;

  const adjustedTarget = playPath ? adjustPathAfterRemoval(targetPath, playPath) : targetPath;

  if (edge) {
    return insertNodeAtEdge(without, adjustedTarget, edge, normalizedPlay);
  }
  return mergeNodeAtTarget(without, adjustedTarget, normalizedPlay);
}

export const LAYOUT_CONTAINER_DRAG_TYPE = 'application/x-battle-standard-layout-container';

export type ContainerDragPayload = {
  fromPath: number[];
};

export function encodeContainerDrag(payload: ContainerDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeContainerDrag(raw: string): ContainerDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as ContainerDragPayload;
    if (Array.isArray(parsed.fromPath)) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function moveContainerInTree(
  root: LayoutNode,
  fromPath: LayoutPath,
  toPath: LayoutPath,
  edge?: SplitEdge,
): LayoutNode {
  if (pathsEqual(fromPath, toPath)) return root;
  if (isPrefixPath(fromPath, toPath)) return root;

  const node = getNodeAtPath(root, fromPath);
  if (!node) return root;

  let without = removeNodeAtPath(root, fromPath);
  if (!without) return root;

  const adjustedTo = resolveTargetPathAfterRemoval(without, toPath, fromPath);
  if (getNodeAtPath(without, adjustedTo) == null) return root;

  if (edge) {
    return insertNodeAtEdge(without, adjustedTo, edge, node);
  }
  return mergeNodeAtTarget(without, adjustedTo, node);
}

export function moveTabToTarget(
  root: LayoutNode,
  fromPath: LayoutPath,
  tabId: string,
  toPath: LayoutPath,
  edge?: SplitEdge,
): LayoutNode {
  if (!edge) return moveTabBetweenGroups(root, fromPath, tabId, toPath);

  const fromNode = getNodeAtPath(root, fromPath);
  if (!fromNode || fromNode.type !== 'tabs') return root;
  const tab = fromNode.tabs.find((t) => t.id === tabId);
  if (!tab) return root;

  let without = removeTabFromGroup(root, fromPath, tabId);
  if (!without) without = root;
  const adjustedTo = resolveTargetPathAfterRemoval(without, toPath, fromPath);
  if (getNodeAtPath(without, adjustedTo) == null) return root;
  const node: ModuleLayoutNode = {
    type: 'module',
    id: `mod-${tab.moduleId}-${Date.now()}`,
    moduleId: tab.moduleId,
  };
  return insertNodeAtEdge(without, adjustedTo, edge, node);
}

export type ActiveDragState =
  | { kind: 'palette'; moduleId: ModuleId }
  | { kind: 'container'; fromPath: LayoutPath }
  | { kind: 'tab'; fromPath: LayoutPath; tabId: string }
  | { kind: 'collapse-palette'; direction: CollapseDirection }
  | { kind: 'collapse-attached'; fromPath: LayoutPath };

export function ghostPathForDrop(targetPath: LayoutPath, edge?: SplitEdge): LayoutPath {
  if (!edge) return targetPath;
  const insertIndex = edge === 'left' || edge === 'top' ? 0 : 1;
  return [...targetPath, insertIndex];
}

export function canPreviewDropAt(activeDrag: ActiveDragState, targetPath: LayoutPath): boolean {
  if (activeDrag.kind === 'container') {
    if (pathsEqual(activeDrag.fromPath, targetPath)) return false;
    if (isPrefixPath(activeDrag.fromPath, targetPath)) return false;
  }
  if (activeDrag.kind === 'collapse-attached') {
    if (pathsEqual(activeDrag.fromPath, targetPath)) return false;
  }
  return true;
}

/** Map preview-tree hover paths back onto paths that exist in the committed tree. */
export function normalizeDragHoverPath(
  root: LayoutNode,
  path: LayoutPath,
  edge?: SplitEdge,
): { path: LayoutPath; edge?: SplitEdge } {
  if (getNodeAtPath(root, path)) return { path, edge };

  if (path.length >= 2) {
    const parentPath = path.slice(0, -1);
    if (getNodeAtPath(root, parentPath)) {
      return { path: parentPath, edge };
    }
  }

  let candidate = path;
  while (candidate.length > 0) {
    if (getNodeAtPath(root, candidate)) return { path: candidate, edge };
    candidate = candidate.slice(0, -1);
  }
  return { path: [], edge };
}

export function stabilizeDragHover(
  prev: { path: LayoutPath; edge?: SplitEdge } | null,
  path: LayoutPath | null,
  edge: SplitEdge | undefined,
): { path: LayoutPath; edge?: SplitEdge } | null {
  if (!path) return null;
  const next = { path, edge };
  if (!prev) return next;

  const prevKey = prev.path.join('.');
  const nextKey = path.join('.');

  // Collapse preview-only child paths onto their committed parent.
  if (prev.edge && nextKey.startsWith(`${prevKey}.`)) {
    return { path: prev.path, edge: edge ?? prev.edge };
  }

  if (prevKey !== nextKey) return next;
  if (prev.edge === edge) return prev;
  return next;
}

export function resolveDragHover(
  root: LayoutNode,
  rawPath: LayoutPath,
  rawEdge: SplitEdge | undefined,
  prev: { path: LayoutPath; edge?: SplitEdge } | null,
  point: DragHoverPoint | undefined,
  previewRoot: HTMLElement | null,
  rectCache?: { current: PanelRectCache },
): { path: LayoutPath; edge?: SplitEdge } {
  const normalized = normalizeDragHoverPath(root, rawPath, rawEdge);
  if (!point || !previewRoot) return normalized;

  const pathKey = normalized.path.join('.');
  const el = findCommittedPathElement(previewRoot, pathKey);
  if (!el) {
    return { path: normalized.path, edge: undefined };
  }

  const liveRect = el.getBoundingClientRect();
  const cacheHit = rectCache?.current?.pathKey === pathKey;
  if (!cacheHit) {
    if (rectCache) rectCache.current = { pathKey, rect: liveRect };
  }
  const rect = cacheHit && rectCache?.current ? rectCache.current.rect : liveRect;

  const stickyEdge =
    prev && prev.path.join('.') === pathKey ? prev.edge : undefined;
  const edge = detectSplitEdgeFromRect(rect, point.clientX, point.clientY, stickyEdge);
  return { path: normalized.path, edge };
}

export function computeDragPreviewVisuals(
  _root: LayoutNode,
  activeDrag: ActiveDragState | null,
  hover: { path: LayoutPath; edge?: SplitEdge } | null,
): { ghostPath: LayoutPath | null; dropTargetPath: LayoutPath | null } {
  if (!activeDrag || !hover) {
    return { ghostPath: null, dropTargetPath: null };
  }

  const { path: targetPath, edge } = hover;
  if (!canPreviewDropAt(activeDrag, targetPath)) {
    return { ghostPath: null, dropTargetPath: null };
  }

  switch (activeDrag.kind) {
    case 'palette':
      return {
        ghostPath: ghostPathForDrop(targetPath, edge),
        dropTargetPath: targetPath,
      };
    case 'container': {
      const adjustedTarget = adjustPathAfterRemoval(targetPath, activeDrag.fromPath);
      return {
        ghostPath: ghostPathForDrop(adjustedTarget, edge),
        dropTargetPath: targetPath,
      };
    }
    case 'tab': {
      const adjustedTarget = adjustPathAfterRemoval(targetPath, activeDrag.fromPath);
      return {
        ghostPath: edge ? ghostPathForDrop(adjustedTarget, edge) : null,
        dropTargetPath: targetPath,
      };
    }
    case 'collapse-palette':
    case 'collapse-attached':
      return { ghostPath: targetPath, dropTargetPath: targetPath };
  }
}

/** Live preview tree for the layout editor. */
export function computeDragPreviewDisplayTree(
  root: LayoutNode,
  activeDrag: ActiveDragState | null,
  hover: { path: LayoutPath; edge?: SplitEdge } | null,
): { tree: LayoutNode; ghostPath: LayoutPath | null; dropTargetPath: LayoutPath | null } {
  if (!activeDrag || !hover) {
    return { tree: root, ghostPath: null, dropTargetPath: null };
  }

  const { path: targetPath } = hover;
  if (!canPreviewDropAt(activeDrag, targetPath)) {
    return { tree: root, ghostPath: null, dropTargetPath: null };
  }

  switch (activeDrag.kind) {
    case 'palette':
    case 'container':
    case 'tab':
    case 'collapse-palette':
    case 'collapse-attached': {
      // Keep the committed tree mounted during drags so drop targets stay stable.
      const visuals = computeDragPreviewVisuals(root, activeDrag, hover);
      return { tree: root, ...visuals };
    }
  }
}

export function computeDragPreviewTree(
  root: LayoutNode,
  activeDrag: ActiveDragState | null,
  hover: { path: LayoutPath; edge?: SplitEdge } | null,
): { tree: LayoutNode; ghostPath: LayoutPath | null; dropTargetPath: LayoutPath | null } {
  if (!activeDrag || !hover) {
    return { tree: root, ghostPath: null, dropTargetPath: null };
  }

  const { path: targetPath, edge } = hover;
  if (!canPreviewDropAt(activeDrag, targetPath)) {
    return { tree: root, ghostPath: null, dropTargetPath: null };
  }

  let preview: LayoutNode;
  let ghostPath: LayoutPath;

  switch (activeDrag.kind) {
    case 'palette':
      preview = dropModuleOnTarget(root, targetPath, activeDrag.moduleId, edge);
      ghostPath = ghostPathForDrop(targetPath, edge);
      break;
    case 'container': {
      const adjustedTarget = adjustPathAfterRemoval(targetPath, activeDrag.fromPath);
      preview = moveContainerInTree(root, activeDrag.fromPath, targetPath, edge);
      ghostPath = ghostPathForDrop(adjustedTarget, edge);
      break;
    }
    case 'tab': {
      const adjustedTarget = adjustPathAfterRemoval(targetPath, activeDrag.fromPath);
      preview = edge
        ? moveTabToTarget(root, activeDrag.fromPath, activeDrag.tabId, targetPath, edge)
        : moveTabBetweenGroups(root, activeDrag.fromPath, activeDrag.tabId, targetPath);
      ghostPath = edge ? ghostPathForDrop(adjustedTarget, edge) : targetPath;
      break;
    }
    case 'collapse-palette':
    case 'collapse-attached':
      return {
        tree: root,
        ghostPath: targetPath,
        dropTargetPath: targetPath,
      };
  }

  if (preview === root) {
    return { tree: root, ghostPath: null, dropTargetPath: null };
  }

  return { tree: preview, ghostPath, dropTargetPath: targetPath };
}

export function splitLayoutSignature(node: SplitLayoutNode): string {
  return node.children.map((child) => child.id).join('|');
}

function collapseSignature(children: LayoutNode[]): string {
  return children
    .map((child) => {
      if (child.type === 'module' || child.type === 'tabs') return child.collapse ?? '';
      return '';
    })
    .join('|');
}

/** Group mount key for remounting panel groups (structure + collapse only; not sizes). */
export function splitPanelGroupKey(node: SplitLayoutNode): string {
  return `${node.id}:${splitLayoutSignature(node)}:${collapseSignature(node.children)}`;
}

export function repairLayoutTreeForDisplay(node: LayoutNode): LayoutNode {
  return normalizeLayoutSplitSizes(repairLayoutTree(node));
}
