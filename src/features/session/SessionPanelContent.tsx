import { useEffect, useRef, useState } from 'react';
import { ROOM_CODE_LENGTH, createRoomCode } from '../../lib/ids';
import { DrawHuePicker } from '../toolbar/DrawHuePicker';
import { disconnectSync, hostRoom } from '../../sync/syncProvider';
import { useStore } from '../../store/useStore';
import { CopyIcon } from './CopyIcon';
import {
  toolBarBtn,
  toolBarBtnActive,
  toolBarControl,
  toolBarRow,
  toolBarSection,
  toolBarSectionLabel,
} from '../toolbar/toolBarStyles';

const STATUS_MIN_W = 'min-w-[11.5rem]';
const ROOM_CODE_PLACEHOLDER = '_'.repeat(ROOM_CODE_LENGTH);

function sessionStatusLabel(
  syncStatus: string,
  reconnecting: boolean,
  peerCount: number,
  needsHttps: boolean,
): string {
  if (reconnecting) return 'Reconnecting…';
  if (needsHttps) return 'Needs HTTPS or localhost';
  switch (syncStatus) {
    case 'offline':
      return 'Offline';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return `Connected (${peerCount} peer${peerCount === 1 ? '' : 's'})`;
    case 'error':
      return 'Sync error';
    default:
      return 'Offline';
  }
}

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

  const hosting = !!roomCode;
  const needsHttps =
    syncStatus === 'error' &&
    typeof window !== 'undefined' &&
    !window.isSecureContext;

  const statusLabel = sessionStatusLabel(syncStatus, reconnecting, peerCount, needsHttps);
  const displayCode = hosting ? roomCode : ROOM_CODE_PLACEHOLDER;

  const iconBtn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-slate-700 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

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
    <div className={`${toolBarRow} h-full w-full min-w-0 gap-0`}>
      <div className={`${toolBarSection} ${toolBarControl} min-w-0 flex-1 items-center px-3`}>
        <span className={`${toolBarSectionLabel} ${STATUS_MIN_W} truncate`} aria-live="polite">
          {statusLabel}
        </span>
      </div>

      <div className="w-px shrink-0 self-stretch bg-slate-700/80" aria-hidden />

      <div className={`${toolBarSection} ${toolBarControl} min-w-0 flex-1 items-center gap-2 px-3`}>
        <span className={toolBarSectionLabel}>Room code</span>
        <div className="flex h-9 min-w-[8.5rem] items-center gap-0.5 rounded-lg bg-slate-900/60 pl-2 pr-1">
          <span
            className={`font-mono text-sm tracking-widest ${
              hosting ? 'text-slate-100' : 'text-slate-500'
            }`}
          >
            #{displayCode}
          </span>
          <button
            type="button"
            className={iconBtn}
            onClick={() => void copyRoomCode()}
            disabled={!hosting}
            aria-label={copied ? 'Room code copied' : 'Copy room code'}
            title={copied ? 'Copied!' : hosting ? 'Copy room code' : 'Host a room to copy code'}
          >
            <CopyIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="w-px shrink-0 self-stretch bg-slate-700/80" aria-hidden />

      <div className={`${toolBarSection} ${toolBarControl} min-w-0 flex-1 items-center gap-2 px-2`}>
        <DrawHuePicker
          hue={drawHue}
          onChange={setDrawHue}
          variant="swatch"
          label="Player color"
        />
      </div>

      {role === 'gm' && (
        <>
          <div className="w-px shrink-0 self-stretch bg-slate-700/80" aria-hidden />
          <button type="button" className={`${toolBarBtnActive} flex-1`} onClick={() => hostRoom(createRoomCode())}>
            Host
          </button>
          <button
            type="button"
            className={`${playerView ? toolBarBtnActive : toolBarBtn} flex-1`}
            onClick={() => setPlayerView(!playerView)}
          >
            {playerView ? 'GM view' : 'Player view'}
          </button>
        </>
      )}

      <div className="w-px shrink-0 self-stretch bg-slate-700/80" aria-hidden />

      <button
        type="button"
        className={`${toolBarBtn} flex-1`}
        disabled={!hosting}
        onClick={() => disconnectSync({ intentional: true })}
      >
        Disconnect
      </button>
    </div>
  );
}
