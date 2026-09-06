import { useEffect, useState } from 'react';
import type { SyncStatus, ToolMode } from '../../lib/types';
import { shouldIgnoreGlobalHotkey } from '../../lib/keyboardTarget';
import { seesAsPlayer, useStore } from '../../store/useStore';
import { FOG_ICON_WIDTH_PX, TOOLBAR_HEIGHT_PX } from './toolbarOverlayMetrics';
import { SquareGridOverlay } from './SquareGridOverlay';
import {
  isToolbarToolVisible,
  TOOLBAR_TOOLS,
  toolForToolbarHotkey,
} from './toolHotkeys';
import { ToolOptionShortcutBadge } from './ToolOptionLayout';

const base = import.meta.env.BASE_URL;

type OverlayKind = 'pan' | 'icon' | 'measure' | 'players';

const OVERLAY_KIND: Partial<Record<ToolMode, OverlayKind>> = {
  pan: 'pan',
  select: 'icon',
  sceneEdit: 'icon',
  fog: 'icon',
  measure: 'measure',
  draw: 'icon',
  players: 'players',
};

const OVERLAY_SRC: Partial<Record<ToolMode, string>> = {
  select: 'select.png',
};

const ICON_SIZE: Partial<Record<ToolMode, string>> = {
  select: 'h-[88%] w-[88%] max-h-[4.5rem] max-w-[4.5rem]',
};

const DEFAULT_ICON_SIZE = 'h-[72%] w-[72%] max-h-16 max-w-16';

function overlayScale(active: boolean, hovered: boolean): string {
  if (active) return 'scale-[1.22] opacity-[0.28]';
  if (hovered) return 'scale-[1.12] opacity-[0.2]';
  return 'scale-100 opacity-[0.12]';
}

function ToolOverlay({
  tool,
  active,
  hovered,
}: {
  tool: ToolMode;
  active: boolean;
  hovered: boolean;
}) {
  const kind = OVERLAY_KIND[tool];
  if (!kind) return null;

  const scale = overlayScale(active, hovered);
  const transition = 'transition-[transform,opacity] duration-200 ease-out';

  if (kind === 'pan') {
    return (
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden ${transition} ${scale}`}
        aria-hidden
      >
        <img
          src={`${base}icons/toolbar/pan.png`}
          alt=""
          className="h-[145%] max-w-none w-auto select-none"
          draggable={false}
        />
      </span>
    );
  }

  if (tool === 'fog') {
    return (
      <span
        className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${transition} ${scale}`}
        aria-hidden
      >
        <img
          src={`${base}icons/toolbar/fog.png`}
          alt=""
          width={FOG_ICON_WIDTH_PX}
          height={TOOLBAR_HEIGHT_PX}
          className="block h-full w-full select-none object-fill"
          draggable={false}
        />
      </span>
    );
  }

  if (kind === 'measure') {
    return (
      <span
        className={`pointer-events-none absolute inset-0 ${transition} ${scale}`}
        style={{
          backgroundImage: `url(${base}icons/toolbar/measure.png)`,
          backgroundRepeat: 'repeat-x',
          backgroundSize: 'auto 100%',
          backgroundPosition: 'center bottom',
        }}
        aria-hidden
      />
    );
  }

  if (kind === 'players') {
    return (
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center ${transition} ${scale}`}
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[4.5rem] w-[4.5rem] text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <circle cx="16.5" cy="9" r="2.5" />
          <path d="M13.5 19c0-2.2 1.8-4 4-4" />
        </svg>
      </span>
    );
  }

  if (tool === 'sceneEdit') {
    return (
      <span
        className={`pointer-events-none absolute inset-0 overflow-hidden ${transition} ${scale}`}
        aria-hidden
      >
        <img
          src={`${base}icons/toolbar/map.png`}
          alt=""
          className="absolute inset-0 h-full w-full select-none object-contain object-center opacity-90"
          draggable={false}
        />
        <SquareGridOverlay className="text-white" />
      </span>
    );
  }

  if (tool === 'draw') {
    return (
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center ${transition} ${scale}`}
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[4.5rem] w-[4.5rem] text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          <path d="m15 5 4 4" />
        </svg>
      </span>
    );
  }

  const src = OVERLAY_SRC[tool];
  if (!src) return null;

  return (
    <span
      className={`pointer-events-none absolute inset-0 flex items-center justify-center ${transition} ${scale}`}
      aria-hidden
    >
      <img
        src={`${base}icons/toolbar/${src}`}
        alt=""
        className={`${ICON_SIZE[tool] ?? DEFAULT_ICON_SIZE} select-none object-contain`}
        draggable={false}
      />
    </span>
  );
}

function SyncStatusBar({ status, active, reconnecting }: { status: SyncStatus; active: boolean; reconnecting: boolean }) {
  const online = status === 'connected' && !reconnecting;
  const colors = active
    ? online
      ? 'bg-emerald-800 text-emerald-50'
      : reconnecting
        ? 'bg-sky-800 text-sky-100'
        : 'bg-sky-800 text-sky-200'
    : online
      ? 'bg-emerald-950/90 text-emerald-400'
      : reconnecting
        ? 'bg-slate-700/95 text-slate-300'
        : 'bg-slate-800/95 text-slate-400';

  const label = online ? 'Online' : reconnecting ? 'Reconnecting' : 'Offline';

  return (
    <span
      className={`absolute inset-x-0 top-0 z-20 flex w-full items-center justify-center rounded-none rounded-b-xl px-1 py-0.5 text-[10px] font-semibold leading-tight ${colors}`}
      aria-live="polite"
    >
      {label}
    </span>
  );
}

export function ToolBar() {
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const syncStatus = useStore((s) => s.syncStatus);
  const reconnecting = useStore((s) => s.reconnecting);
  const asPlayer = seesAsPlayer(role, playerView);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      if (shouldIgnoreGlobalHotkey(e.target)) return;
      // Typing on the map with the draw text tool — don't steal keys for tool hotkeys.
      if (useStore.getState().ephemeralDrawText) return;

      const tool = toolForToolbarHotkey(e.key);
      if (!tool || !isToolbarToolVisible(tool, asPlayer)) return;

      e.preventDefault();
      useStore.getState().setTool(tool);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [asPlayer]);

  return (
    <nav
      className="relative shrink-0 overflow-visible border-t border-slate-700 bg-slate-900/95 h-[80px]"
      aria-label="Map tools"
    >
      <div className="flex h-full items-stretch divide-x divide-slate-700">
        {TOOLBAR_TOOLS.map((t) => {
          if (t.id === 'fog' && asPlayer) return null;
          if (t.id === 'sceneEdit' && asPlayer) return null;
          const active = activeTool === t.id;
          const isPlayers = t.id === 'players';
          return (
            <div key={t.id} className="relative flex min-w-0 flex-1 flex-col">
              <ToolBarButton
                label={t.label}
                hotkey={t.hotkey}
                tool={t.id}
                active={active}
                onClick={() => setTool(t.id)}
              >
                {isPlayers && (
                  <SyncStatusBar status={syncStatus} active={active} reconnecting={reconnecting} />
                )}
              </ToolBarButton>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function ToolBarButton({
  label,
  hotkey,
  tool,
  active,
  onClick,
  children,
}: {
  label: string;
  hotkey: string;
  tool: ToolMode;
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-2 text-xs outline-none transition-colors ${
        active ? 'bg-sky-600 text-white' : 'bg-slate-900/0 text-slate-300 hover:bg-slate-800'
      }`}
      aria-label={`${label} (${hotkey})`}
    >
      <ToolOverlay tool={tool} active={active} hovered={hovered} />
      <span className="relative z-10 flex flex-col items-center gap-0.5">
        <ToolOptionShortcutBadge
          label={hotkey}
          className={active ? 'text-sky-100' : 'text-slate-400'}
        />
        <span className="font-medium">{label}</span>
      </span>
      {children}
    </button>
  );
}
