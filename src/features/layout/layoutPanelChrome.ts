import type { CollapseDirection, LayoutNode } from './schema/layoutSchema';
import { updateNodeAtPath, type LayoutPath } from './layoutTreeUtils';

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
  if (node.type === 'module' || node.type === 'tabs') return node.collapse;
  return undefined;
}

export function setPanelCollapseAtPath(
  root: LayoutNode,
  path: LayoutPath,
  collapse: CollapseDirection | undefined,
): LayoutNode {
  return updateNodeAtPath(root, path, (node) => {
    if (node.type === 'module' || node.type === 'tabs') {
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

function normalizePercentLayout(
  children: LayoutNode[],
  percents: number[],
): Record<string, number> {
  const total = percents.reduce((a, b) => a + b, 0) || 1;
  const normalized = percents.map((s) => (s / total) * 100);
  return Object.fromEntries(children.map((child, i) => [child.id, normalized[i]!]));
}

/**
 * Expand one collapsible panel to its stored % while leaving other collapsed panels at 0%.
 * Shrinks only siblings that are currently expanded.
 */
export function layoutAfterExpandingOnePanel(
  children: LayoutNode[],
  currentLayout: Record<string, number>,
  expandPanelId: string,
  expandToPercent: number,
): Record<string, number> {
  const expandTo = Math.max(expandToPercent, COLLAPSED_PANEL_SIZE_THRESHOLD);
  const expandCurrent = currentLayout[expandPanelId] ?? 0;
  const needed = expandTo - expandCurrent;
  if (needed <= 0.05) {
    return currentLayout;
  }

  const shrinkable = children.filter(
    (c) =>
      c.id !== expandPanelId && !isCollapsedPanelSize(currentLayout[c.id] ?? 0),
  );
  const shrinkableTotal = shrinkable.reduce(
    (sum, c) => sum + (currentLayout[c.id] ?? 0),
    0,
  );

  const raw = children.map((child) => {
    if (child.id === expandPanelId) return expandTo;
    const cur = currentLayout[child.id] ?? 0;
    if (isCollapsedPanelSize(cur)) return 0;
    if (shrinkableTotal <= 0) return cur;
    const share = cur / shrinkableTotal;
    return Math.max(0, cur - needed * share);
  });

  return normalizePercentLayout(children, raw);
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
