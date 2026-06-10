import type { SessionRole, ToolMode } from '../../lib/types';
import { toolBarScroll } from './toolBarStyles';
import { ToolOptionsPanel } from './ToolOptionsPanel';
import { seesAsPlayer, useStore } from '../../store/useStore';

export function shouldShowToolOptions(activeTool: ToolMode, role: SessionRole, playerView: boolean): boolean {
  const asPlayer = seesAsPlayer(role, playerView);
  return (
    activeTool === 'players' ||
    activeTool === 'pan' ||
    activeTool === 'select' ||
    activeTool === 'measure' ||
    activeTool === 'draw' ||
    (activeTool === 'fog' && !asPlayer) ||
    (activeTool === 'sceneEdit' && !asPlayer)
  );
}

export function ToolOptionsBar({ className = '' }: { className?: string }) {
  const activeTool = useStore((s) => s.activeTool);
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);

  if (!shouldShowToolOptions(activeTool, role, playerView)) return null;

  return (
    <div className={`${toolBarScroll} ${className}`}>
      <ToolOptionsPanel />
    </div>
  );
}
