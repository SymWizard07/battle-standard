import type { LayoutNode, LayoutTab, ModuleId, ModuleLayoutNode } from './schema/layoutSchema';
import type { ActiveDragState } from './layoutTreeUtils';
import {
  getNodeAtPath,
  removeNodeAtPath,
  removeTabFromGroup,
  updateNodeAtPath,
  type LayoutPath,
} from './layoutTreeUtils';

export type LayoutRegion = 'left' | 'right' | 'top' | 'bottom' | 'center';

export type LayoutRegionState = {
  vacant: boolean;
};

export type LayoutRegionMap = Record<LayoutRegion, LayoutRegionState>;

const SLOT_SIZE = 18;

function normalizeSizes(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return sizes.map((s) => (s / total) * 100);
}

function isPrefixPath(prefix: LayoutPath, path: LayoutPath): boolean {
  if (prefix.length > path.length) return false;
  return prefix.every((v, i) => v === path[i]);
}

export function nodeHasPanelContent(node: LayoutNode): boolean {
  if (node.type === 'playArea') return false;
  if (node.type === 'module') return node.moduleId !== 'canvas';
  if (node.type === 'tabs') return node.tabs.some((t) => t.moduleId !== 'canvas');
  if (node.type === 'split') return node.children.some((c) => nodeHasPanelContent(c));
  return false;
}

function isOnlyPlayArea(node: LayoutNode): boolean {
  if (node.type === 'playArea') return true;
  if (node.type === 'module' && node.moduleId === 'canvas') return true;
  if (node.type === 'split' && node.children.length === 1) {
    return isOnlyPlayArea(node.children[0]!);
  }
  return false;
}

function findPlayAreaPath(root: LayoutNode, path: LayoutPath = []): LayoutPath | null {
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

function findMainRowAnchor(
  root: LayoutNode,
  playPath: LayoutPath,
): { rowPath: LayoutPath; centerChildIndex: number } | null {
  if (root.type === 'split' && root.direction === 'row') {
    for (let i = 0; i < root.children.length; i++) {
      const childPath = [i];
      if (isPrefixPath(childPath, playPath) || playPath.join('.') === childPath.join('.')) {
        return { rowPath: [], centerChildIndex: i };
      }
    }
  }

  for (let depth = 1; depth <= playPath.length; depth++) {
    const rowPath = playPath.slice(0, depth - 1);
    const node = getNodeAtPath(root, rowPath);
    if (node?.type === 'split' && node.direction === 'row') {
      const centerChildIndex = playPath[depth - 1];
      if (centerChildIndex !== undefined) {
        return { rowPath, centerChildIndex };
      }
    }
  }

  return null;
}

/** Outermost row split containing the play area (canonical sidebar row shell). */
function findShellRowAnchor(
  root: LayoutNode,
  playPath: LayoutPath,
): { rowPath: LayoutPath; centerChildIndex: number } | null {
  if (root.type === 'split' && root.direction === 'row') {
    for (let i = 0; i < root.children.length; i++) {
      const childPath = [i];
      if (isPrefixPath(childPath, playPath) || playPath.join('.') === childPath.join('.')) {
        return { rowPath: [], centerChildIndex: i };
      }
    }
  }

  for (let depth = 1; depth <= playPath.length; depth++) {
    const rowPath = playPath.slice(0, depth - 1);
    const node = getNodeAtPath(root, rowPath);
    if (node?.type === 'split' && node.direction === 'row') {
      const centerChildIndex = playPath[depth - 1];
      if (centerChildIndex !== undefined) {
        return { rowPath, centerChildIndex };
      }
    }
  }

  return null;
}

/** Panel in a nested row inside the center column (e.g. tokens beside play) — not a root sidebar slot. */
function centerSubtreeHasPanelBesidePlay(
  root: LayoutNode,
  rowPath: LayoutPath,
  centerChildIndex: number,
  playPath: LayoutPath,
  side: 'left' | 'right',
): boolean {
  const centerPath: LayoutPath = [...rowPath, centerChildIndex];
  if (!isPrefixPath(centerPath, playPath)) return false;
  const centerNode = getNodeAtPath(root, centerPath);
  if (!centerNode) return false;

  const relPlay = playPath.slice(centerPath.length);
  for (let depth = 1; depth <= relPlay.length; depth++) {
    const subPath = relPlay.slice(0, depth - 1);
    const node =
      subPath.length === 0 ? centerNode : getNodeAtPath(centerNode, subPath);
    if (!node || node.type !== 'split' || node.direction !== 'row') continue;
    const playIdx = relPlay[depth - 1]!;
    for (let i = 0; i < node.children.length; i++) {
      if (side === 'left' && i >= playIdx) continue;
      if (side === 'right' && i <= playIdx) continue;
      const child = node.children[i];
      if (child && nodeHasPanelContent(child)) return true;
    }
  }
  return false;
}

function shellRowSideHasPanelContent(
  root: LayoutNode,
  rowPath: LayoutPath,
  centerChildIndex: number,
  side: 'left' | 'right',
): boolean {
  const row = getNodeAtPath(root, rowPath);
  if (!row || row.type !== 'split' || row.direction !== 'row') return false;

  if (side === 'left') {
    for (let i = 0; i < centerChildIndex; i++) {
      const child = row.children[i];
      if (child && nodeHasPanelContent(child)) return true;
      if ((row.sizes[i] ?? 0) >= 2) {
        const childNode = getNodeAtPath(root, [...rowPath, i]);
        if (childNode && !isOnlyPlayArea(childNode)) return true;
      }
    }
    return false;
  }

  for (let i = centerChildIndex + 1; i < row.children.length; i++) {
    const child = row.children[i];
    if (child && nodeHasPanelContent(child)) return true;
    if ((row.sizes[i] ?? 0) >= 2) {
      const childNode = getNodeAtPath(root, [...rowPath, i]);
      if (childNode && !isOnlyPlayArea(childNode)) return true;
    }
  }
  return false;
}

function findCenterColAnchor(
  root: LayoutNode,
  playPath: LayoutPath,
): { colPath: LayoutPath; playChildIndex: number } | null {
  for (let depth = playPath.length; depth > 0; depth--) {
    const colPath = playPath.slice(0, depth - 1);
    const node = getNodeAtPath(root, colPath);
    if (node?.type === 'split' && node.direction === 'col') {
      const playChildIndex = playPath[depth - 1];
      if (playChildIndex !== undefined) {
        return { colPath, playChildIndex };
      }
    }
  }
  return null;
}

/** True if any col ancestor of the play area has panel content above/below the play child. */
function anyColBesidePlayHasPanelContent(
  root: LayoutNode,
  playPath: LayoutPath,
  side: 'top' | 'bottom',
): boolean {
  for (let depth = playPath.length; depth >= 1; depth--) {
    const colPath = playPath.slice(0, depth - 1);
    const col = getNodeAtPath(root, colPath);
    if (!col || col.type !== 'split' || col.direction !== 'col') continue;
    const playChildIndex = playPath[depth - 1]!;
    if (colSideHasPanelContent(root, colPath, playChildIndex, side)) return true;
  }
  return false;
}

function colSideHasPanelContent(
  root: LayoutNode,
  colPath: LayoutPath,
  playChildIndex: number,
  side: 'top' | 'bottom',
): boolean {
  const col = getNodeAtPath(root, colPath);
  if (!col || col.type !== 'split') return false;

  if (side === 'top') {
    for (let i = 0; i < playChildIndex; i++) {
      const child = col.children[i];
      if (child && nodeHasPanelContent(child)) return true;
      if ((col.sizes[i] ?? 0) >= 2) {
        const childPath = [...colPath, i];
        const childNode = getNodeAtPath(root, childPath);
        if (childNode && !isOnlyPlayArea(childNode)) return true;
      }
    }
    return false;
  }

  for (let i = playChildIndex + 1; i < col.children.length; i++) {
    const child = col.children[i];
    if (child && nodeHasPanelContent(child)) return true;
    if ((col.sizes[i] ?? 0) >= 2) {
      const childPath = [...colPath, i];
      const childNode = getNodeAtPath(root, childPath);
      if (childNode && !isOnlyPlayArea(childNode)) return true;
    }
  }
  return false;
}

/** Top/bottom chrome may live in the center col or in a sibling col when play sits in the main row. */
function shellRowHasTopBottomPanelContent(
  root: LayoutNode,
  playPath: LayoutPath,
  side: 'top' | 'bottom',
): boolean {
  const rowAnchor = findMainRowAnchor(root, playPath);
  if (!rowAnchor) {
    return anyColBesidePlayHasPanelContent(root, playPath, side);
  }

  const row = getNodeAtPath(root, rowAnchor.rowPath);
  if (!row || row.type !== 'split' || row.direction !== 'row') {
    return anyColBesidePlayHasPanelContent(root, playPath, side);
  }

  let found = false;
  for (let i = 0; i < row.children.length; i++) {
    const childPath: LayoutPath = [...rowAnchor.rowPath, i];
    const child = row.children[i];
    if (!child || child.type !== 'split' || child.direction !== 'col') continue;

    if (isPrefixPath(childPath, playPath)) {
      const playIdx = playPath[childPath.length] ?? 0;
      if (colSideHasPanelContent(root, childPath, playIdx, side)) found = true;
    } else if (side === 'top') {
      if (colSideHasPanelContent(root, childPath, 1, 'top')) found = true;
    } else if (child.children.length > 0) {
      const anchorIdx = Math.max(0, child.children.length - 2);
      if (colSideHasPanelContent(root, childPath, anchorIdx, 'bottom')) found = true;
    }
  }

  return found || anyColBesidePlayHasPanelContent(root, playPath, side);
}

function hasVacantTopBottomRestoreSlots(root: LayoutNode, playPath: LayoutPath): { top: boolean; bottom: boolean } {
  const colAnchor = findCenterColAnchor(root, playPath);
  if (colAnchor) {
    return {
      top: !!firstVacantColSlotPath(root, colAnchor.colPath, colAnchor.playChildIndex, 'top'),
      bottom: !!firstVacantColSlotPath(root, colAnchor.colPath, colAnchor.playChildIndex, 'bottom'),
    };
  }

  const rowAnchor = findMainRowAnchor(root, playPath);
  if (rowAnchor) {
    const centerPath: LayoutPath = [...rowAnchor.rowPath, rowAnchor.centerChildIndex];
    const center = getNodeAtPath(root, centerPath);
    if (center?.type === 'split' && center.direction === 'col' && isPrefixPath(centerPath, playPath)) {
      const playIdx = playPath[centerPath.length] ?? 0;
      return {
        top: !!firstVacantColSlotPath(root, centerPath, playIdx, 'top'),
        bottom: !!firstVacantColSlotPath(root, centerPath, playIdx, 'bottom'),
      };
    }
  }

  return {
    top: !shellRowHasTopBottomPanelContent(root, playPath, 'top'),
    bottom: !shellRowHasTopBottomPanelContent(root, playPath, 'bottom'),
  };
}

export function analyzeLayoutRegions(root: LayoutNode): LayoutRegionMap {
  const playPath = findPlayAreaPath(root);
  const vacantAll: LayoutRegionMap = {
    left: { vacant: false },
    right: { vacant: false },
    top: { vacant: false },
    bottom: { vacant: false },
    center: { vacant: false },
  };

  if (!playPath) {
    vacantAll.center.vacant = true;
    vacantAll.left.vacant = true;
    vacantAll.right.vacant = true;
    vacantAll.top.vacant = true;
    vacantAll.bottom.vacant = true;
    return vacantAll;
  }

  vacantAll.center.vacant = isOnlyPlayArea(root);

  vacantAll.left.vacant = canRestoreSideRegion(root, playPath, 'left');
  vacantAll.right.vacant = canRestoreSideRegion(root, playPath, 'right');

  const { top, bottom } = hasVacantTopBottomRestoreSlots(root, playPath);
  vacantAll.top.vacant = top;
  vacantAll.bottom.vacant = bottom;

  return vacantAll;
}

/** Debug snapshot for restore-zone visibility (session logging). */
export function getLayoutRegionDiagnostics(root: LayoutNode) {
  const playPath = findPlayAreaPath(root);
  const shellRowAnchor = playPath ? findShellRowAnchor(root, playPath) : null;
  return {
    playPath,
    rowAnchor: shellRowAnchor,
    shellRowAnchor,
    regions: analyzeLayoutRegions(root),
  };
}

function createModuleNode(moduleId: ModuleId): ModuleLayoutNode {
  return { type: 'module', id: `mod-${moduleId}-${Date.now()}`, moduleId };
}

function insertChildInSplit(
  root: LayoutNode,
  parentPath: LayoutPath,
  index: number,
  node: LayoutNode,
  preferredSize = SLOT_SIZE,
): LayoutNode {
  const parent = parentPath.length === 0 ? root : getNodeAtPath(root, parentPath);

  if (!parent || parent.type !== 'split') {
    if (parentPath.length === 0) {
      const direction = index === 0 ? 'row' : 'col';
      return {
        type: 'split',
        id: `split-${Date.now()}`,
        direction,
        sizes: normalizeSizes([preferredSize, 100 - preferredSize]),
        children: index === 0 ? [node, root] : [root, node],
      };
    }
    return root;
  }

  const children = [...parent.children];
  const sizes = [...parent.sizes];
  children.splice(index, 0, node);
  sizes.splice(index, 0, preferredSize);

  return updateNodeAtPath(root, parentPath, () => ({
    ...parent,
    children,
    sizes: normalizeSizes(sizes),
  }));
}

function replaceChildAtPath(root: LayoutNode, childPath: LayoutPath, node: LayoutNode): LayoutNode {
  if (childPath.length === 0) return node;
  const parentPath = childPath.slice(0, -1);
  const childIndex = childPath[childPath.length - 1]!;
  return updateNodeAtPath(root, parentPath, (parent) => {
    if (parent.type !== 'split') return parent;
    const children = parent.children.map((c, i) => (i === childIndex ? node : c));
    return { ...parent, children };
  });
}

/** True when insertNodeIntoRegion can add a sidebar even if no empty child slot exists yet. */
function canRestoreSideRegion(
  root: LayoutNode,
  playPath: LayoutPath,
  side: 'left' | 'right',
): boolean {
  if (root.type === 'split' && root.direction === 'col') {
    const playTop = playPath[0] ?? 0;
    if (side === 'left') {
      if (playTop > 0) return true;
      const first = root.children[0];
      if (!first || first.type === 'playArea') return true;
      if (first.type === 'module' || first.type === 'tabs') return false;
      return true;
    }
    if (playTop < root.children.length - 1) return true;
    const last = root.children[root.children.length - 1];
    if (!last || last.type === 'playArea') return true;
    if (last.type === 'module' || last.type === 'tabs') return false;
    return true;
  }

  const rowAnchor = findShellRowAnchor(root, playPath);
  if (!rowAnchor) {
    return true;
  }
  if (
    firstVacantSideSlotPath(root, rowAnchor.rowPath, rowAnchor.centerChildIndex, side)
  ) {
    return true;
  }
  const row = getNodeAtPath(root, rowAnchor.rowPath);
  if (!row || row.type !== 'split' || row.direction !== 'row') return false;
  if (side === 'left') {
    if (rowAnchor.centerChildIndex !== 0) return false;
    if (
      centerSubtreeHasPanelBesidePlay(
        root,
        rowAnchor.rowPath,
        rowAnchor.centerChildIndex,
        playPath,
        'left',
      )
    ) {
      return false;
    }
    return !shellRowSideHasPanelContent(
      root,
      rowAnchor.rowPath,
      rowAnchor.centerChildIndex,
      'left',
    );
  }
  if (rowAnchor.centerChildIndex < row.children.length - 1) return false;
  if (
    centerSubtreeHasPanelBesidePlay(
      root,
      rowAnchor.rowPath,
      rowAnchor.centerChildIndex,
      playPath,
      'right',
    )
  ) {
    return false;
  }
  return !shellRowSideHasPanelContent(
    root,
    rowAnchor.rowPath,
    rowAnchor.centerChildIndex,
    'right',
  );
}

function firstVacantSideSlotPath(
  root: LayoutNode,
  rowPath: LayoutPath,
  centerChildIndex: number,
  side: 'left' | 'right',
): LayoutPath | null {
  const row = getNodeAtPath(root, rowPath);
  if (!row || row.type !== 'split') return null;

  if (side === 'left') {
    for (let i = 0; i < centerChildIndex; i++) {
      const child = row.children[i];
      const childPath = [...rowPath, i];
      if (!child || !nodeHasPanelContent(child) || (row.sizes[i] ?? 0) < 2) {
        return childPath;
      }
    }
    return null;
  }

  for (let i = centerChildIndex + 1; i < row.children.length; i++) {
    const child = row.children[i];
    const childPath = [...rowPath, i];
    if (!child || !nodeHasPanelContent(child) || (row.sizes[i] ?? 0) < 2) {
      return childPath;
    }
  }
  return null;
}

function firstVacantColSlotPath(
  root: LayoutNode,
  colPath: LayoutPath,
  playChildIndex: number,
  side: 'top' | 'bottom',
): LayoutPath | null {
  const col = getNodeAtPath(root, colPath);
  if (!col || col.type !== 'split') return null;

  if (side === 'top') {
    for (let i = 0; i < playChildIndex; i++) {
      const child = col.children[i];
      const childPath = [...colPath, i];
      if (!child || !nodeHasPanelContent(child) || (col.sizes[i] ?? 0) < 2) {
        return childPath;
      }
    }
    return null;
  }

  for (let i = playChildIndex + 1; i < col.children.length; i++) {
    const child = col.children[i];
    const childPath = [...colPath, i];
    if (!child || !nodeHasPanelContent(child) || (col.sizes[i] ?? 0) < 2) {
      return childPath;
    }
  }
  return null;
}

export function insertNodeIntoRegion(
  root: LayoutNode,
  region: LayoutRegion,
  node: LayoutNode,
): LayoutNode {
  const playPath = findPlayAreaPath(root);
  if (!playPath) return root;

  if (region === 'center') {
    if (playPath.length === 0) {
      return {
        type: 'split',
        id: `split-${Date.now()}`,
        direction: 'row',
        sizes: normalizeSizes([SLOT_SIZE, 100 - SLOT_SIZE]),
        children: [node, root],
      };
    }

    const colAnchor = findCenterColAnchor(root, playPath);
    if (colAnchor) {
      const vacantTop = firstVacantColSlotPath(root, colAnchor.colPath, colAnchor.playChildIndex, 'top');
      if (vacantTop) return replaceChildAtPath(root, vacantTop, node);
      return insertChildInSplit(root, colAnchor.colPath, colAnchor.playChildIndex, node);
    }

    const rowAnchor = findMainRowAnchor(root, playPath);
    if (rowAnchor) {
      return insertChildInSplit(root, rowAnchor.rowPath, rowAnchor.centerChildIndex, node);
    }

    const parentPath = playPath.slice(0, -1);
    const playIndex = playPath[playPath.length - 1]!;
    return insertChildInSplit(root, parentPath, playIndex, node);
  }

  if (region === 'left' || region === 'right') {
    const rowAnchor = findMainRowAnchor(root, playPath);
    if (!rowAnchor) {
      if (region === 'left') {
        return {
          type: 'split',
          id: `split-${Date.now()}`,
          direction: 'row',
          sizes: normalizeSizes([SLOT_SIZE, 100 - SLOT_SIZE]),
          children: [node, root],
        };
      }
      return {
        type: 'split',
        id: `split-${Date.now()}`,
        direction: 'row',
        sizes: normalizeSizes([100 - SLOT_SIZE, SLOT_SIZE]),
        children: [root, node],
      };
    }

    const vacantSlot = firstVacantSideSlotPath(
      root,
      rowAnchor.rowPath,
      rowAnchor.centerChildIndex,
      region,
    );
    if (vacantSlot) return replaceChildAtPath(root, vacantSlot, node);

    const insertIndex = region === 'left' ? 0 : rowAnchor.centerChildIndex + 1;
    return insertChildInSplit(root, rowAnchor.rowPath, insertIndex, node);
  }

  const colAnchor = findCenterColAnchor(root, playPath);
  if (!colAnchor) {
    if (region === 'top') {
      const playNode = getNodeAtPath(root, playPath)!;
      let next = removeNodeAtPath(root, playPath);
      if (!next) next = playNode;
      return {
        type: 'split',
        id: `split-${Date.now()}`,
        direction: 'col',
        sizes: normalizeSizes([SLOT_SIZE, 100 - SLOT_SIZE]),
        children: [node, playNode],
      };
    }
    const playNode = getNodeAtPath(root, playPath)!;
    let next = removeNodeAtPath(root, playPath);
    if (!next) next = playNode;
    return {
      type: 'split',
      id: `split-${Date.now()}`,
      direction: 'col',
      sizes: normalizeSizes([100 - SLOT_SIZE, SLOT_SIZE]),
      children: [playNode, node],
    };
  }

  if (region === 'top') {
    const vacantTop = firstVacantColSlotPath(root, colAnchor.colPath, colAnchor.playChildIndex, 'top');
    if (vacantTop) return replaceChildAtPath(root, vacantTop, node);
    return insertChildInSplit(root, colAnchor.colPath, colAnchor.playChildIndex, node);
  }

  const vacantBottom = firstVacantColSlotPath(
    root,
    colAnchor.colPath,
    colAnchor.playChildIndex,
    'bottom',
  );
  if (vacantBottom) return replaceChildAtPath(root, vacantBottom, node);

  const col = getNodeAtPath(root, colAnchor.colPath);
  const insertIndex = col?.type === 'split' ? col.children.length : colAnchor.playChildIndex + 1;
  return insertChildInSplit(root, colAnchor.colPath, insertIndex, node);
}

export function insertModuleIntoRegion(
  root: LayoutNode,
  region: LayoutRegion,
  moduleId: ModuleId,
): LayoutNode {
  return insertNodeIntoRegion(root, region, createModuleNode(moduleId));
}

function tabToModuleNode(tab: LayoutTab): ModuleLayoutNode {
  return { type: 'module', id: `mod-${tab.moduleId}-${Date.now()}`, moduleId: tab.moduleId };
}

export function applyExternalRegionDrop(
  root: LayoutNode,
  region: LayoutRegion,
  drag: ActiveDragState,
): LayoutNode {
  switch (drag.kind) {
    case 'palette':
      return insertModuleIntoRegion(root, region, drag.moduleId);
    case 'container': {
      const node = getNodeAtPath(root, drag.fromPath);
      if (!node) return root;
      let without = removeNodeAtPath(root, drag.fromPath);
      if (!without) without = root;
      return insertNodeIntoRegion(without, region, node);
    }
    case 'tab': {
      const fromNode = getNodeAtPath(root, drag.fromPath);
      if (!fromNode || fromNode.type !== 'tabs') return root;
      const tab = fromNode.tabs.find((t) => t.id === drag.tabId);
      if (!tab) return root;
      const without = removeTabFromGroup(root, drag.fromPath, drag.tabId);
      return insertNodeIntoRegion(without, region, tabToModuleNode(tab));
    }
    case 'collapse-palette':
    case 'collapse-attached':
      return root;
  }
}

export function removeDraggedItem(root: LayoutNode, drag: ActiveDragState): LayoutNode {
  switch (drag.kind) {
    case 'palette':
      return root;
    case 'container': {
      const node = getNodeAtPath(root, drag.fromPath);
      if (!node) return root;
      const removed = removeNodeAtPath(root, drag.fromPath);
      return removed ?? root;
    }
    case 'tab': {
      const fromNode = getNodeAtPath(root, drag.fromPath);
      if (!fromNode || fromNode.type !== 'tabs') return root;
      const tab = fromNode.tabs.find((t) => t.id === drag.tabId);
      if (!tab) return root;
      return removeTabFromGroup(root, drag.fromPath, drag.tabId);
    }
    case 'collapse-palette':
    case 'collapse-attached':
      return root;
  }
}

export const LAYOUT_REGION_LABELS: Record<LayoutRegion, string> = {
  left: 'Left sidebar',
  right: 'Right sidebar',
  top: 'Top bar',
  bottom: 'Bottom bar',
  center: 'Center',
};

export function regionDropHint(region: LayoutRegion): string {
  return `Drop to restore ${LAYOUT_REGION_LABELS[region].toLowerCase()}`;
}
