import { useEffect, useRef, useState } from 'react';
import { createRoomCode } from '../../lib/ids';
import { DrawHuePicker } from '../toolbar/DrawHuePicker';
import { disconnectSync, hostRoom } from '../../sync/syncProvider';
import { useStore } from '../../store/useStore';
import { CopyIcon } from './CopyIcon';

export function SessionPanelContent() {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomCode = useStore((s) => s.roomCode);
  const syncStatus = useStore((s) => s.syncStatus);
  const reconnecting = useStore((s) => s.reconnecting);
  const peerCount = useStore((s) => s.peerCount);
  const drawHue = useStore((s) => s.drawHue ?? 0);
  const setDrawHue = useStore((s) => s.setDrawHue);
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const setPlayerView = useStore((s) => s.setPlayerView);

  const needsHttps =
    syncStatus === 'error' &&
    typeof window !== 'undefined' &&
    !window.isSecureContext;

  const statusLabel = reconnecting
    ? 'Reconnecting…'
    : needsHttps
      ? 'Needs HTTPS or localhost'
      : {
          offline: 'Offline',
          connecting: 'Connecting…',
          connected: `Connected (${peerCount} peer${peerCount === 1 ? '' : 's'})`,
          error: 'Sync error',
        }[syncStatus];

  const btn = 'h-11 rounded-lg bg-slate-800 px-3 text-xs text-slate-200 hover:bg-slate-700';
  const btnPrimary =
    'h-11 rounded-lg bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-500';

  const iconBtn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-slate-700 hover:text-slate-100';

  const copyRoomCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  return (
    <div className="flex min-w-0 shrink-0 flex-nowrap items-center gap-2">
      <div className="hidden shrink-0 text-[11px] text-slate-400 lg:block">{statusLabel}</div>

      {roomCode && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400">Room code</span>
          <div className="flex h-11 items-center gap-0.5 rounded-lg bg-slate-800 pl-3 pr-1">
            <span className="font-mono text-sm tracking-widest text-slate-100">#{roomCode}</span>
            <button
              type="button"
              className={iconBtn}
              onClick={() => void copyRoomCode()}
              aria-label="Copy room code"
              title="Copy room code"
            >
              <CopyIcon className="h-4 w-4" />
            </button>
          </div>
          {copied && (
            <span
              className="text-[10px] font-semibold text-emerald-400"
              role="status"
              aria-live="polite"
            >
              Copied!
            </span>
          )}
        </div>
      )}

      <DrawHuePicker hue={drawHue} onChange={setDrawHue} variant="swatch" />

      {role === 'gm' && (
        <>
          <button type="button" className={btnPrimary} onClick={() => hostRoom(createRoomCode())}>
            Host
          </button>
          <button
            type="button"
            className={playerView ? btnPrimary : btn}
            onClick={() => setPlayerView(!playerView)}
          >
            {playerView ? 'GM view' : 'Player view'}
          </button>
        </>
      )}

      {roomCode && (
        <button type="button" className={btn} onClick={() => disconnectSync({ intentional: true })}>
          Disconnect
        </button>
      )}
    </div>
  );
}
