/** Minimum snap distance for design-ratio targets (px). */
export const PANEL_RESIZE_SNAP_THRESHOLD_RATIO_PX = 14;
/** Minimum snap distance for matching another panel's width/height (px). */
export const PANEL_RESIZE_SNAP_THRESHOLD_SIZE_PX = 28;
/** Minimum snap distance for aligning to panel edges and split gaps (px). */
export const PANEL_RESIZE_SNAP_THRESHOLD_GAP_PX = 32;

/** @deprecated Use kind-specific thresholds above. */
export const PANEL_RESIZE_SNAP_THRESHOLD_PX = PANEL_RESIZE_SNAP_THRESHOLD_RATIO_PX;

/** Common layout proportions (golden ratio, thirds, quarters, app defaults). */
export const PANEL_DESIGN_RATIOS = [
  0.08,
  0.1,
  0.12,
  0.14,
  0.18,
  0.2,
  0.25,
  1 / 3,
  0.382,
  0.4,
  0.5,
  0.618,
  2 / 3,
  0.75,
  0.82,
  0.86,
  0.9,
  0.92,
] as const;

export type PanelMeasurement = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type SnapGroupLayoutArgs = {
  root: HTMLElement | null;
  groupEl: HTMLElement;
  orientation: 'horizontal' | 'vertical';
  childIds: string[];
  prevLayout: Record<string, number>;
  nextLayout: Record<string, number>;
};

type SnapTarget =
  | { kind: 'ratio'; value: number }
  | { kind: 'panel-size'; value: number; panelId: string; side: 'leading' | 'trailing' }
  | { kind: 'panel-edge'; value: number }
  | { kind: 'separator'; value: number };

export function findSnapRoot(groupEl: HTMLElement): HTMLElement {
  return (
    (groupEl.closest('[data-app-layout-surface]') as HTMLElement | null) ??
    (groupEl.closest('[data-layout-preview]') as HTMLElement | null) ??
    groupEl
  );
}

export function measurePanels(root: HTMLElement): PanelMeasurement[] {
  return measureSnapUnits(root, null);
}

/** Id used for size-match highlights — nested groups map to their hosting panel slot. */
function snapUnitIdForGroup(groupEl: HTMLElement): string | null {
  let node: HTMLElement | null = groupEl.parentElement;
  while (node) {
    if (node.hasAttribute('data-panel') && node.id) {
      return node.id;
    }
    node = node.parentElement;
  }
  return groupEl.id || null;
}

function measurementFromRect(id: string, rect: DOMRect): PanelMeasurement {
  return {
    id,
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Panels and nested split groups for snap targets.
 * Individual `[data-panel]` slots and `[data-group]` regions are both included.
 */
export function measureSnapUnits(
  root: HTMLElement,
  activeGroupEl: HTMLElement | null,
): PanelMeasurement[] {
  const byId = new Map<string, PanelMeasurement>();

  const add = (id: string, rect: DOMRect) => {
    if (!id || (rect.width <= 0 && rect.height <= 0)) return;
    const next = measurementFromRect(id, rect);
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, next);
      return;
    }
    const existingArea = existing.width * existing.height;
    const nextArea = next.width * next.height;
    if (nextArea > existingArea) {
      byId.set(id, next);
    }
  };

  root.querySelectorAll('[data-panel]').forEach((el) => {
    if (el instanceof HTMLElement && el.id) {
      add(el.id, el.getBoundingClientRect());
    }
  });

  root.querySelectorAll('[data-group]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (activeGroupEl && el === activeGroupEl) return;
    const id = snapUnitIdForGroup(el);
    if (id) add(id, el.getBoundingClientRect());
  });

  return [...byId.values()];
}

function snapThresholdPx(axisSize: number, kind: SnapTarget['kind']): number {
  switch (kind) {
    case 'panel-size':
      return Math.max(PANEL_RESIZE_SNAP_THRESHOLD_SIZE_PX, axisSize * 0.04);
    case 'panel-edge':
    case 'separator':
      return Math.max(PANEL_RESIZE_SNAP_THRESHOLD_GAP_PX, axisSize * 0.045);
    default:
      return Math.max(PANEL_RESIZE_SNAP_THRESHOLD_RATIO_PX, axisSize * 0.022);
  }
}

function buildSnapTargets(
  root: HTMLElement,
  groupEl: HTMLElement,
  orientation: 'horizontal' | 'vertical',
): SnapTarget[] {
  const groupRect = groupEl.getBoundingClientRect();
  const axisSize = orientation === 'horizontal' ? groupRect.width : groupRect.height;
  if (axisSize <= 0) return [];

  const targets: SnapTarget[] = [];
  const units = measureSnapUnits(root, groupEl);

  for (const ratio of PANEL_DESIGN_RATIOS) {
    targets.push({ kind: 'ratio', value: axisSize * ratio });
    for (const ratio2 of PANEL_DESIGN_RATIOS) {
      const sum = ratio + ratio2;
      if (sum < 0.995) targets.push({ kind: 'ratio', value: axisSize * sum });
    }
  }

  for (const unit of units) {
    const size = orientation === 'horizontal' ? unit.width : unit.height;
    if (size > 0.5 && size < axisSize - 0.5) {
      targets.push({ kind: 'panel-size', value: size, panelId: unit.id, side: 'leading' });
      targets.push({
        kind: 'panel-size',
        value: axisSize - size,
        panelId: unit.id,
        side: 'trailing',
      });
    }

    const start = orientation === 'horizontal' ? unit.left - groupRect.left : unit.top - groupRect.top;
    const end = orientation === 'horizontal' ? unit.right - groupRect.left : unit.bottom - groupRect.top;
    if (start > 0.5 && start < axisSize - 0.5) targets.push({ kind: 'panel-edge', value: start });
    if (end > 0.5 && end < axisSize - 0.5) targets.push({ kind: 'panel-edge', value: end });
  }

  for (const separator of root.querySelectorAll('[data-separator]')) {
    if (!(separator instanceof HTMLElement)) continue;
    const rect = separator.getBoundingClientRect();
    const center =
      orientation === 'horizontal'
        ? rect.left + rect.width / 2 - groupRect.left
        : rect.top + rect.height / 2 - groupRect.top;
    if (center > 0.5 && center < axisSize - 0.5) {
      targets.push({ kind: 'separator', value: center });
    }
  }

  return targets;
}

export function buildAxisSnapTargets(
  root: HTMLElement,
  groupEl: HTMLElement,
  orientation: 'horizontal' | 'vertical',
): number[] {
  return buildSnapTargets(root, groupEl, orientation).map((target) => target.value);
}

function snapNearestTarget(
  value: number,
  targets: SnapTarget[],
  axisSize: number,
): SnapTarget | null {
  let best: SnapTarget | null = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    const threshold = snapThresholdPx(axisSize, target.kind);
    const distance = Math.abs(target.value - value);
    if (distance <= threshold && distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

export function findActiveSeparatorIndex(
  childIds: string[],
  prevLayout: Record<string, number>,
  nextLayout: Record<string, number>,
): number {
  let bestIndex = -1;
  let bestDelta = 0;
  for (let i = 0; i < childIds.length - 1; i++) {
    const leftId = childIds[i]!;
    const rightId = childIds[i + 1]!;
    const delta =
      Math.abs((nextLayout[leftId] ?? 0) - (prevLayout[leftId] ?? 0)) +
      Math.abs((nextLayout[rightId] ?? 0) - (prevLayout[rightId] ?? 0));
    if (delta > bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  return bestDelta > 0.05 ? bestIndex : -1;
}

function cumulativePercent(childIds: string[], layout: Record<string, number>, throughIndex: number): number {
  return childIds.slice(0, throughIndex + 1).reduce((sum, id) => sum + (layout[id] ?? 0), 0);
}

export function layoutWithBoundaryPercent(
  childIds: string[],
  layout: Record<string, number>,
  separatorIndex: number,
  boundaryPercent: number,
): Record<string, number> {
  const result = { ...layout };
  const currentBoundary = cumulativePercent(childIds, layout, separatorIndex);
  const delta = boundaryPercent - currentBoundary;
  const leftId = childIds[separatorIndex]!;
  const rightId = childIds[separatorIndex + 1]!;
  if (!rightId) return result;

  let nextLeft = (result[leftId] ?? 0) + delta;
  let nextRight = (result[rightId] ?? 0) - delta;

  const minSize = 0;
  if (nextLeft < minSize) {
    nextRight += nextLeft - minSize;
    nextLeft = minSize;
  }
  if (nextRight < minSize) {
    nextLeft += nextRight - minSize;
    nextRight = minSize;
  }

  result[leftId] = Math.round(nextLeft * 1000) / 1000;
  result[rightId] = Math.round(nextRight * 1000) / 1000;
  return result;
}

export type SnapGroupLayoutResult = {
  layout: Record<string, number>;
  /** Panel ids to highlight when snap locked to another panel's width/height. */
  sizeMatchedPanelIds: string[];
};

/** Panels involved in a size snap: the matched unit and the panel being resized. */
export function highlightIdsForPanelSizeSnap(
  target: Extract<SnapTarget, { kind: 'panel-size' }>,
  childIds: string[],
  separatorIndex: number,
): string[] {
  const leftId = childIds[separatorIndex]!;
  const rightId = childIds[separatorIndex + 1];
  if (!rightId) return [target.panelId];

  const resizingId = target.side === 'leading' ? leftId : rightId;
  if (resizingId === target.panelId) return [target.panelId];
  return [target.panelId, resizingId];
}

export function snapGroupLayout({
  root,
  groupEl,
  orientation,
  childIds,
  prevLayout,
  nextLayout,
}: SnapGroupLayoutArgs): SnapGroupLayoutResult {
  if (!root || childIds.length < 2) {
    return { layout: nextLayout, sizeMatchedPanelIds: [] };
  }

  const groupRect = groupEl.getBoundingClientRect();
  const axisSize = orientation === 'horizontal' ? groupRect.width : groupRect.height;
  if (axisSize <= 0) {
    return { layout: nextLayout, sizeMatchedPanelIds: [] };
  }

  const separatorIndex = findActiveSeparatorIndex(childIds, prevLayout, nextLayout);
  if (separatorIndex < 0) {
    return { layout: nextLayout, sizeMatchedPanelIds: [] };
  }

  const boundaryPx =
    (cumulativePercent(childIds, nextLayout, separatorIndex) / 100) * axisSize;
  const targets = buildSnapTargets(root, groupEl, orientation);
  const matchedTarget = snapNearestTarget(boundaryPx, targets, axisSize);

  if (!matchedTarget || Math.abs(matchedTarget.value - boundaryPx) < 0.5) {
    return { layout: nextLayout, sizeMatchedPanelIds: [] };
  }

  const snappedPx = matchedTarget.value;
  const snappedPercent = (snappedPx / axisSize) * 100;
  const layout = layoutWithBoundaryPercent(childIds, nextLayout, separatorIndex, snappedPercent);

  if (matchedTarget.kind !== 'panel-size') {
    return { layout, sizeMatchedPanelIds: [] };
  }

  return {
    layout,
    sizeMatchedPanelIds: highlightIdsForPanelSizeSnap(matchedTarget, childIds, separatorIndex),
  };
}

export function layoutsNearlyEqual(
  a: Record<string, number>,
  b: Record<string, number>,
  epsilon = 0.05,
): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    if (Math.abs((a[id] ?? 0) - (b[id] ?? 0)) > epsilon) return false;
  }
  return true;
}

let shiftHeld = false;
let shiftListenerCount = 0;

function onPanelResizeShiftKeyDown(e: KeyboardEvent) {
  if (e.key === 'Shift') shiftHeld = true;
}

function onPanelResizeShiftKeyUp(e: KeyboardEvent) {
  if (e.key === 'Shift') shiftHeld = false;
}

function onPanelResizeWindowBlur() {
  shiftHeld = false;
}

export function isPanelResizeSnapSuppressed(): boolean {
  return shiftHeld;
}

/** Track Shift for panel resize snap bypass; ref-counted across split groups. */
export function retainPanelResizeSnapShiftListeners(): () => void {
  shiftListenerCount += 1;
  if (shiftListenerCount === 1) {
    window.addEventListener('keydown', onPanelResizeShiftKeyDown);
    window.addEventListener('keyup', onPanelResizeShiftKeyUp);
    window.addEventListener('blur', onPanelResizeWindowBlur);
  }
  return () => {
    shiftListenerCount -= 1;
    if (shiftListenerCount === 0) {
      window.removeEventListener('keydown', onPanelResizeShiftKeyDown);
      window.removeEventListener('keyup', onPanelResizeShiftKeyUp);
      window.removeEventListener('blur', onPanelResizeWindowBlur);
      shiftHeld = false;
    }
  };
}
