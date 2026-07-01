import type { ToolMode } from '../../lib/types';

export interface ToolbarToolDef {
  id: ToolMode;
  label: string;
  hotkey: string;
}

export const TOOLBAR_TOOLS: ToolbarToolDef[] = [
  { id: 'pan', label: 'Pan', hotkey: 'Q' },
  { id: 'select', label: 'Select', hotkey: 'W' },
  { id: 'sceneEdit', label: 'Scene', hotkey: 'E' },
  { id: 'fog', label: 'Fog', hotkey: 'R' },
  { id: 'measure', label: 'Measure', hotkey: 'T' },
  { id: 'draw', label: 'Draw', hotkey: 'Y' },
  { id: 'players', label: 'Players', hotkey: 'U' },
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
