import type { ToolMode } from '../../lib/types';

export interface ToolbarToolDef {
  id: ToolMode;
  label: string;
  hotkey: string;
}

export const TOOLBAR_TOOLS: ToolbarToolDef[] = [
  { id: 'pan', label: 'Pan', hotkey: 'H' },
  { id: 'select', label: 'Select', hotkey: 'S' },
  { id: 'sceneEdit', label: 'Scene', hotkey: 'E' },
  { id: 'fog', label: 'Fog', hotkey: 'F' },
  { id: 'measure', label: 'Measure', hotkey: 'R' },
  { id: 'draw', label: 'Draw', hotkey: 'D' },
  { id: 'players', label: 'Players', hotkey: 'P' },
];

const HOTKEY_TO_TOOL = new Map(
  TOOLBAR_TOOLS.map((t) => [t.hotkey.toLowerCase(), t.id]),
);

export function toolForToolbarHotkey(key: string): ToolMode | null {
  if (key.length !== 1) return null;
  return HOTKEY_TO_TOOL.get(key.toLowerCase()) ?? null;
}

export function isToolbarToolVisible(tool: ToolMode, asPlayer: boolean): boolean {
  if (asPlayer && (tool === 'fog' || tool === 'sceneEdit')) return false;
  return TOOLBAR_TOOLS.some((t) => t.id === tool);
}
