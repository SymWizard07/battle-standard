import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { isCollapsedPanelSize } from '../layoutPanelChrome';

export function readPanelCollapsed(panel: PanelImperativeHandle): boolean {
  return panel.isCollapsed() || isCollapsedPanelSize(panel.getSize().asPercentage);
}

/** Tracks whether a resizable panel is currently collapsed (live collapse handle or 0% size). */
export function usePanelCollapsed(
  panelRef: RefObject<PanelImperativeHandle | null>,
  panelElementRef: RefObject<HTMLDivElement | null>,
): boolean {
  const [collapsed, setCollapsed] = useState(false);

  const syncCollapsed = useCallback(() => {
    const panel = panelRef.current;
    setCollapsed(panel ? readPanelCollapsed(panel) : false);
  }, [panelRef]);

  useEffect(() => {
    syncCollapsed();
    const el = panelElementRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => syncCollapsed());
    ro.observe(el);
    return () => ro.disconnect();
  }, [panelElementRef, syncCollapsed]);

  return collapsed;
}
