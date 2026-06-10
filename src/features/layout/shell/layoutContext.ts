import { createContext, useContext } from 'react';
import type { LayoutModuleContext } from '../LayoutModuleContext';

export const LayoutContext = createContext<LayoutModuleContext | null>(null);

export function useLayoutContext(): LayoutModuleContext {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayoutContext must be used within LayoutShell');
  return ctx;
}

export const LAYOUT_TAB_DRAG_TYPE = 'application/x-battle-standard-layout-tab';

export type TabDragPayload = {
  tabId: string;
  fromPath: number[];
};

export function encodeTabDragPayload(payload: TabDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeTabDragPayload(raw: string): TabDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as TabDragPayload;
    if (typeof parsed.tabId === 'string' && Array.isArray(parsed.fromPath)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}
