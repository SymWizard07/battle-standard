import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { GroupImperativeHandle } from 'react-resizable-panels';
import {
  findSnapRoot,
  isPanelResizeSnapSuppressed,
  layoutsNearlyEqual,
  retainPanelResizeSnapShiftListeners,
  snapGroupLayout,
} from './panelResizeSnap';

type Options = {
  enabled: boolean;
  orientation: 'horizontal' | 'vertical';
  childIds: string[];
  groupRef: RefObject<GroupImperativeHandle | null>;
  groupElementRef: RefObject<HTMLDivElement | null>;
  onCommit: (layout: Record<string, number>) => void;
  onSnapSizeMatch?: (panelIds: string[]) => void;
};

export function useSnappingSplitHandlers({
  enabled,
  orientation,
  childIds,
  groupRef,
  groupElementRef,
  onCommit,
  onSnapSizeMatch,
}: Options) {
  const prevLayoutRef = useRef<Record<string, number>>({});
  const snappingRef = useRef(false);

  const syncPrevLayout = useCallback((layout: Record<string, number>) => {
    prevLayoutRef.current = layout;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const layout = groupRef.current?.getLayout();
    if (layout) prevLayoutRef.current = layout;
  }, [childIds.join('|'), enabled, groupRef]);

  useEffect(() => {
    if (!enabled) return;
    return retainPanelResizeSnapShiftListeners();
  }, [enabled]);

  const onLayoutChange = useCallback(
    (layout: Record<string, number>) => {
      if (!enabled) {
        prevLayoutRef.current = layout;
        onSnapSizeMatch?.([]);
        return;
      }

      const groupEl = groupElementRef.current;
      if (!groupEl) {
        prevLayoutRef.current = layout;
        onSnapSizeMatch?.([]);
        return;
      }

      if (snappingRef.current) {
        snappingRef.current = false;
        prevLayoutRef.current = layout;
        return;
      }

      if (isPanelResizeSnapSuppressed()) {
        prevLayoutRef.current = layout;
        onSnapSizeMatch?.([]);
        return;
      }

      const root = findSnapRoot(groupEl);
      const { layout: snapped, sizeMatchedPanelIds } = snapGroupLayout({
        root,
        groupEl,
        orientation,
        childIds,
        prevLayout: prevLayoutRef.current,
        nextLayout: layout,
      });

      prevLayoutRef.current = snapped;
      onSnapSizeMatch?.(sizeMatchedPanelIds);

      if (!layoutsNearlyEqual(snapped, layout)) {
        snappingRef.current = true;
        try {
          groupRef.current?.setLayout(snapped);
        } catch {
          /* group unmounting */
        }
      }
    },
    [childIds, enabled, groupElementRef, groupRef, onSnapSizeMatch, orientation],
  );

  const onLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      prevLayoutRef.current = layout;
      onSnapSizeMatch?.([]);
      onCommit(layout);
    },
    [onCommit, onSnapSizeMatch],
  );

  return { onLayoutChange, onLayoutChanged, syncPrevLayout };
}
