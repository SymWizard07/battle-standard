import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import type { CollapseDirection } from '../schema/layoutSchema';
import {
  COLLAPSE_LABELS,
  MIN_EXPANDED_PANEL_PERCENT,
  collapseArrowForPanel,
  collapseHandleSide,
} from '../layoutPanelChrome';
import { readPanelCollapsed, usePanelCollapsed } from './usePanelCollapsed';

type Props = {
  panelRef: RefObject<PanelImperativeHandle | null>;
  panelElementRef: RefObject<HTMLDivElement | null>;
  collapse: CollapseDirection;
  /** Last expanded size from the layout tree (percent of parent group). */
  storedSizePercent: number;
  /** Collapse this panel in the group without touching other collapsed siblings. */
  onCollapsePanelLayout?: () => void;
  /** Expand this panel in the group without opening other collapsed siblings. */
  onRestoreExpandedLayout?: () => void;
};

const EDGE_LAYOUT: Record<
  CollapseDirection,
  { className: string; horizontal: boolean }
> = {
  left: {
    className:
      'left-0 top-1/2 -translate-x-full -translate-y-1/2 rounded-l-md border-r-0',
    horizontal: true,
  },
  right: {
    className:
      'right-0 top-1/2 translate-x-full -translate-y-1/2 rounded-r-md border-l-0',
    horizontal: true,
  },
  top: {
    className:
      'top-0 left-1/2 -translate-x-1/2 -translate-y-full rounded-t-md border-b-0',
    horizontal: false,
  },
  bottom: {
    className:
      'bottom-0 left-1/2 -translate-x-1/2 translate-y-full rounded-b-md border-t-0',
    horizontal: false,
  },
};

export function PanelCollapseHandle({
  panelRef,
  panelElementRef,
  collapse,
  storedSizePercent,
  onCollapsePanelLayout,
  onRestoreExpandedLayout,
}: Props) {
  const collapsed = usePanelCollapsed(panelRef, panelElementRef);
  const lastExpandedPercentRef = useRef(storedSizePercent);
  const handleEdge = collapseHandleSide(collapse);
  const layout = EDGE_LAYOUT[handleEdge];

  useEffect(() => {
    if (storedSizePercent >= MIN_EXPANDED_PANEL_PERCENT) {
      lastExpandedPercentRef.current = storedSizePercent;
    }
  }, [storedSizePercent]);

  const syncCollapsed = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (readPanelCollapsed(panel)) return;
    const current = panel.getSize().asPercentage;
    if (current >= MIN_EXPANDED_PANEL_PERCENT) {
      lastExpandedPercentRef.current = current;
    }
  }, [panelRef]);

  const restoreSize = () => {
    const panel = panelRef.current;
    if (!panel) return;
    const remembered =
      lastExpandedPercentRef.current >= MIN_EXPANDED_PANEL_PERCENT
        ? lastExpandedPercentRef.current
        : 0;
    const target =
      storedSizePercent >= MIN_EXPANDED_PANEL_PERCENT
        ? Math.max(storedSizePercent, remembered)
        : remembered >= MIN_EXPANDED_PANEL_PERCENT
          ? remembered
          : 20;

    try {
      if (onRestoreExpandedLayout) {
        onRestoreExpandedLayout();
      } else if (panel.isCollapsed()) {
        panel.expand();
        panel.resize(target);
      } else {
        panel.resize(target);
      }
    } catch {
      /* panel/group unmounting */
    }

    requestAnimationFrame(syncCollapsed);
  };

  const collapsePanel = () => {
    const panel = panelRef.current;
    if (!panel) return;
    const current = panel.getSize().asPercentage;
    if (current >= MIN_EXPANDED_PANEL_PERCENT) {
      lastExpandedPercentRef.current = current;
    } else if (storedSizePercent >= MIN_EXPANDED_PANEL_PERCENT) {
      lastExpandedPercentRef.current = storedSizePercent;
    }
    try {
      if (onCollapsePanelLayout) {
        onCollapsePanelLayout();
      } else if (!panel.isCollapsed()) {
        panel.collapse();
      }
    } catch {
      /* panel/group unmounting */
    }

    requestAnimationFrame(syncCollapsed);
  };

  const toggle = () => {
    const panel = panelRef.current;
    if (!panel) return;
    if (readPanelCollapsed(panel)) {
      restoreSize();
    } else {
      collapsePanel();
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title={collapsed ? 'Expand panel' : COLLAPSE_LABELS[collapse]}
      aria-label={collapsed ? 'Expand panel' : `Collapse panel ${collapse}`}
      aria-expanded={!collapsed}
      className={`pointer-events-auto absolute z-40 flex cursor-pointer items-center justify-center border border-slate-600 bg-slate-800 text-xs font-semibold text-slate-200 shadow-lg hover:border-sky-500 hover:bg-slate-750 hover:text-sky-100 active:bg-slate-700 ${
        layout.horizontal ? 'h-14 w-7' : 'h-7 w-14'
      } ${layout.className}`}
    >
      {collapseArrowForPanel(collapsed, collapse)}
    </button>
  );
}
