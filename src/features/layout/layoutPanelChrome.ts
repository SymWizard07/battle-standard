import type { CollapseDirection, LayoutNode } from './schema/layoutSchema';
import { getNodeAtPath, updateNodeAtPath, type LayoutPath } from './layoutTreeUtils';

export const LAYOUT_COLLAPSE_DRAG_TYPE = 'application/x-battle-standard-layout-collapse';

export type CollapseDragPayload =
  | { kind: 'palette'; direction: CollapseDirection }
  | { kind: 'attached'; fromPath: number[] };

export const COLLAPSE_DIRECTIONS: CollapseDirection[] = ['left', 'right', 'top', 'bottom'];

export const COLLAPSE_LABELS: Record<CollapseDirection, string> = {
  left: 'Collapse left',
  right: 'Collapse right',
  top: 'Collapse up',
  bottom: 'Collapse down',
};

export const COLLAPSE_ARROWS: Record<CollapseDirection, string> = {
  left: '◀',
  right: '▶',
  top: '▲',
  bottom: '▼',
};

export function encodeCollapseDrag(payload: CollapseDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeCollapseDrag(raw: string): CollapseDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as CollapseDragPayload;
    if (parsed.kind === 'palette' && COLLAPSE_DIRECTIONS.includes(parsed.direction)) {
      return parsed;
    }
    if (parsed.kind === 'attached' && Array.isArray(parsed.fromPath)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getPanelCollapse(node: LayoutNode): CollapseDirection | undefined {
  if (node.type === 'module' || node.type === 'tabs' || node.type === 'split') {
    return node.collapse;
  }
  return undefined;
}

/** Collapse assigned to a split group, shown on each direct child panel in preview. */
export type SplitCollapseLink = {
  direction: CollapseDirection;
  fromPath: LayoutPath;
  linkId: string;
};

const COLLAPSE_LINK_PALETTE = [
  { border: 'border-rose-400', bg: 'bg-rose-950/95', text: 'text-rose-200' },
  { border: 'border-amber-400', bg: 'bg-amber-950/95', text: 'text-amber-200' },
  { border: 'border-emerald-400', bg: 'bg-emerald-950/95', text: 'text-emerald-200' },
  { border: 'border-violet-400', bg: 'bg-violet-950/95', text: 'text-violet-200' },
  { border: 'border-cyan-400', bg: 'bg-cyan-950/95', text: 'text-cyan-200' },
  { border: 'border-fuchsia-400', bg: 'bg-fuchsia-950/95', text: 'text-fuchsia-200' },
] as const;

export function collapseLinkClassName(linkId: string): string {
  let hash = 0;
  for (let i = 0; i < linkId.length; i++) {
    hash = (hash * 31 + linkId.charCodeAt(i)) >>> 0;
  }
  const entry = COLLAPSE_LINK_PALETTE[hash % COLLAPSE_LINK_PALETTE.length]!;
  return `${entry.border} ${entry.bg} ${entry.text}`;
}

/**
 * When dropping collapse on a module/tab in a simple split column, assign to the split group.
 */
export function resolveCollapseAssignmentPath(
  root: LayoutNode,
  targetPath: LayoutPath,
): LayoutPath {
  const target = getNodeAtPath(root, targetPath);
  if (!target) return targetPath;
  if (target.type === 'split') return targetPath;
  if (target.type !== 'module' && target.type !== 'tabs') return targetPath;
  if (getPanelCollapse(target) != null) return targetPath;
  if (targetPath.length === 0) return targetPath;

  const parentPath = targetPath.slice(0, -1);
  const parent = getNodeAtPath(root, parentPath);
  if (parent?.type !== 'split') return targetPath;

  const simplePanelGroup = parent.children.every(
    (child) => child.type === 'module' || child.type === 'tabs',
  );
  if (!simplePanelGroup) return targetPath;

  return parentPath;
}

export function setPanelCollapseAtPath(
  root: LayoutNode,
  path: LayoutPath,
  collapse: CollapseDirection | undefined,
): LayoutNode {
  return updateNodeAtPath(root, path, (node) => {
    if (node.type === 'module' || node.type === 'tabs' || node.type === 'split') {
      if (collapse == null) {
        const { collapse: _removed, ...rest } = node;
        return rest as LayoutNode;
      }
      return { ...node, collapse };
    }
    return node;
  });
}

const COLLAPSE_EXPAND_ARROW: Record<CollapseDirection, CollapseDirection> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};

/** Edge that hosts the control (opposite the collapse direction). */
export function collapseHandleSide(collapse: CollapseDirection): CollapseDirection {
  return COLLAPSE_EXPAND_ARROW[collapse];
}

/** Arrow on the control: collapse direction when expanded, opposite when collapsed. */
export function collapseArrowForPanel(collapsed: boolean, collapse: CollapseDirection): string {
  const key = collapsed ? COLLAPSE_EXPAND_ARROW[collapse] : collapse;
  return COLLAPSE_ARROWS[key];
}

/** Panels below this % are treated as collapsed (persist + UI). */
export const COLLAPSED_PANEL_SIZE_THRESHOLD = 5;

/** True when a layout size update reflects a collapsed panel (near 0%). */
export function isCollapsedPanelSize(percent: number): boolean {
  return percent < COLLAPSED_PANEL_SIZE_THRESHOLD;
}

function collapsiblePanelExpandedPercent(
  child: LayoutNode,
  livePercent: number,
  storedPercent: number,
): number {
  if (!getPanelCollapse(child) || child.type === 'playArea') return livePercent;
  if (
    livePercent < COLLAPSED_PANEL_SIZE_THRESHOLD &&
    storedPercent >= COLLAPSED_PANEL_SIZE_THRESHOLD
  ) {
    return storedPercent;
  }
  return livePercent;
}

/**
 * Restore expanded panels to stored tree sizes; keep other collapsed panels at 0%.
 */
export function layoutAfterExpandingOnePanel(
  children: LayoutNode[],
  currentLayout: Record<string, number>,
  expandPanelId: string,
  storedSizes: number[],
): Record<string, number> {
  const collapsedIds = new Set(
    children
      .filter(
        (c) =>
          c.id !== expandPanelId && isCollapsedPanelSize(currentLayout[c.id] ?? 0),
      )
      .map((c) => c.id),
  );

  const expandedStoredTotal = children.reduce((sum, child, i) => {
    if (collapsedIds.has(child.id)) return sum;
    return sum + (storedSizes[i] ?? 0);
  }, 0);

  const raw = children.map((child, i) => {
    if (collapsedIds.has(child.id)) return 0;
    const stored = storedSizes[i] ?? 0;
    if (expandedStoredTotal <= 0) return 100 / Math.max(children.length, 1);
    return (stored / expandedStoredTotal) * 100;
  });

  return Object.fromEntries(children.map((child, i) => [child.id, raw[i]!]));
}

/** Whether a group layout change is driven by a collapsible panel at collapsed size. */
export function splitLayoutHasCollapsedPanel(
  children: LayoutNode[],
  layout: Record<string, number>,
): boolean {
  return children.some((child) => {
    const dir = getPanelCollapse(child);
    if (!dir || child.type === 'playArea') return false;
    return isCollapsedPanelSize(layout[child.id] ?? 0);
  });
}

/**
 * Build persisted split sizes from a group layout event.
 * While a collapsible panel is collapsed, keep the stored tree unchanged (expanded sizes).
 */
export function persistableSplitSizesFromLayout(
  children: LayoutNode[],
  layout: Record<string, number>,
  storedSizes: number[],
): number[] | null {
  if (splitLayoutHasCollapsedPanel(children, layout)) {
    return null;
  }
  return children.map((child, i) => {
    const live = layout[child.id] ?? storedSizes[i] ?? 0;
    const stored = storedSizes[i] ?? 0;
    return collapsiblePanelExpandedPercent(child, live, stored);
  });
}
