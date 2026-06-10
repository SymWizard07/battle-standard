import type { LayoutPath } from '../layout/layoutTreeUtils';

export const LAYOUT_EDITOR_PANEL_DRAG_TYPE = 'application/x-layout-editor-panel';

export type EditorPanelDragPayload = {
  kind: 'container';
  fromPath: LayoutPath;
};

export type EditorTabDragPayload = {
  kind: 'tab';
  fromPath: LayoutPath;
  tabId: string;
};

export function encodePanelDrag(payload: EditorPanelDragPayload): string {
  return JSON.stringify(payload);
}

export function decodePanelDrag(raw: string): EditorPanelDragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EditorPanelDragPayload;
    if (parsed.kind === 'container' && Array.isArray(parsed.fromPath)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}
