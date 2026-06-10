import type { SceneEditMode, ToolMode } from './types';

export function resolveSceneEditTool(
  activeTool: ToolMode,
  sceneEditMode: SceneEditMode,
): 'gridEdit' | 'mapEdit' | null {
  if (activeTool === 'gridEdit') return 'gridEdit';
  if (activeTool === 'mapEdit') return 'mapEdit';
  if (activeTool === 'sceneEdit') {
    return sceneEditMode === 'grid' ? 'gridEdit' : 'mapEdit';
  }
  return null;
}
