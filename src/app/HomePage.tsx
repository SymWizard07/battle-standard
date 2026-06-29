import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDocumentTitle, useDocumentTitle, APP_TITLE } from '../hooks/useDocumentTitle';
import { deleteCampaign, listCampaigns } from '../lib/db';
import type { Campaign } from '../lib/types';
import { savePendingJoin } from '../sync/sessionReconnect';
import { createAndSetCampaign, useStore } from '../store/useStore';
import { confirmAction } from '../features/confirm/confirmDialogStore';
import { normalizeRoomCode } from '../lib/ids';
import { PlayerNameSection } from '../features/session/PlayerNameSection';
import { PasteIcon } from '../features/session/PasteIcon';
import { RoomCodeInput } from '../features/session/RoomCodeInput';
import { PlayAreaGridBackground, PlayAreaGridBackgroundBlurred } from '../features/layout/PlayAreaGridBackground';
import { ScatteredGridTokens } from '../features/layout/ScatteredGridTokens';
import { SaveFolderSection } from '../features/storage/SaveFolderSection';
import { deleteCampaignFromStorage, preferSyncFromDisk } from '../lib/companion/companionStorage';

const fieldLabel = 'mb-2 text-sm font-medium text-slate-400';
const fieldRow = 'grid w-full grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2';
const joinFieldRow = 'grid w-full grid-cols-[minmax(0,1fr)_2.75rem_7.5rem] items-center gap-2';
const textInput =
  'min-h-11 w-full min-w-0 rounded-xl border border-slate-500/50 bg-slate-950/35 px-3 text-slate-100 backdrop-blur-md';
const actionButton = 'min-h-11 w-full shrink-0 rounded-xl px-5 font-medium';
const iconButton =
  'flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl border border-slate-500/50 bg-slate-950/35 text-slate-300 backdrop-blur-md hover:bg-slate-800/50 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40';
const fieldError = 'mt-2 text-sm text-red-400';
const sectionDivider = 'border-t border-slate-600/50 pt-5';

/** Frost panel — soft grid overlay above tokens, below content. */
const frostShell =
  'pointer-events-none absolute inset-y-0 right-0 left-0 z-[2] isolate mx-auto w-[min(calc(100%-2rem),calc(32rem+3rem))] overflow-hidden';

/** Clipped frost zone — matches shell bounds (no bleed past column edges). */
const panelBlurZone =
  'absolute inset-0 overflow-clip border-x border-slate-400/55 ring-1 ring-inset ring-white/10';

/** Frost overlay — tint only; clipped to column bounds. */
const panelFrostOverlay = 'home-frost-overlay';

/** Viewport-height content column — matches frost width so tokens blur across the panel. */
const viewportColumn =
  'relative z-10 mx-auto h-full min-h-0 w-full max-w-[min(calc(100%-2rem),calc(32rem+3rem))] bg-slate-950/20 backdrop-blur-md';

/** Scrollable content inside the viewport column. */
const contentScroll =
  'safe-top safe-bottom relative h-full min-h-0 overflow-y-auto overscroll-contain px-5 py-5';

export function HomePage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const playerName = useStore((s) => s.playerName);

  const refresh = () => {
    void listCampaigns().then(setCampaigns);
  };

  useEffect(() => {
    refresh();
    void preferSyncFromDisk().then(() => refresh());
  }, []);

  useDocumentTitle(formatDocumentTitle('Campaigns'));

  const create = async () => {
    const trimmed = name.trim() || 'New Campaign';
    const c = await createAndSetCampaign(trimmed);
    setName('');
    refresh();
    navigate(`/campaign/${c.id}`);
  };

  const joinSession = async (codeOverride?: string) => {
    const code = normalizeRoomCode(codeOverride ?? joinCode);
    const displayName = playerName.trim();
    if (!code || !displayName) return;

    setJoinError('');
    useStore.getState().setPlayerName(displayName);
    const c = await createAndSetCampaign(`Session ${code}`);
    savePendingJoin({ roomCode: code, playerName: displayName, campaignId: c.id });
    setJoinCode('');
    refresh();
    navigate(`/campaign/${c.id}`);
  };

  const pasteJoinCode = async () => {
    setJoinError('');
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      const code = normalizeRoomCode(text);
      if (!code) return;
      setJoinCode(code);
      await joinSession(code);
    } catch {
      setJoinError('Could not read from clipboard.');
    }
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      <PlayAreaGridBackground />
      <ScatteredGridTokens />

      <div aria-hidden className={frostShell}>
        <div className={panelBlurZone}>
          <PlayAreaGridBackgroundBlurred />
          <div className={panelFrostOverlay} />
        </div>
      </div>

      <div className={viewportColumn}>
        <div className={contentScroll}>
          <div className="flex flex-col gap-5">
            <header className="shrink-0 text-center">
              <h1 className="font-title text-5xl leading-none tracking-[0.04em] text-slate-50 sm:text-6xl">
                {APP_TITLE}
              </h1>
              <p className="mt-2 text-slate-400">
                Scene-deck tracker for D&amp;D 5e — grid, tokens, fog, and ruler.
              </p>
            </header>

            <section className="shrink-0">
              <h2 className={fieldLabel}>Your name</h2>
              <PlayerNameSection variant="embedded" />
            </section>

            <section className={`shrink-0 ${sectionDivider}`}>
              <h2 className={fieldLabel}>New campaign</h2>
              <div className={fieldRow}>
                <input
                  className={textInput}
                  placeholder="Campaign name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void create()}
                />
                <button
                  type="button"
                  onClick={() => void create()}
                  className={`${actionButton} bg-sky-600 text-white hover:bg-sky-500`}
                >
                  Create
                </button>
              </div>
            </section>

            <section className={`shrink-0 ${sectionDivider}`}>
              <h2 className={fieldLabel}>Join session</h2>
              <div className={joinFieldRow}>
                <RoomCodeInput
                  value={joinCode}
                  onChange={setJoinCode}
                  onEnter={() => void joinSession()}
                />
                <button
                  type="button"
                  onClick={() => void pasteJoinCode()}
                  className={iconButton}
                  aria-label="Paste room code"
                >
                  <PasteIcon />
                </button>
                <button
                  type="button"
                  onClick={() => void joinSession()}
                  disabled={!playerName.trim() || !joinCode.trim()}
                  className={`${actionButton} bg-slate-800/70 text-slate-100 backdrop-blur-sm hover:bg-slate-700/80 disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  Join
                </button>
              </div>
              {joinError && <p className={fieldError}>{joinError}</p>}
            </section>

            <section className={`shrink-0 ${sectionDivider}`}>
              <SaveFolderSection campaignCount={campaigns.length} onStorageChange={refresh} />
            </section>

            <section className={`shrink-0 pb-2 ${sectionDivider}`}>
              <h2 className={fieldLabel}>Your campaigns</h2>
              {campaigns.length === 0 ? (
                <p className="text-sm text-slate-500">No campaigns yet.</p>
              ) : (
                <ul className="space-y-2">
                  {campaigns.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 rounded-xl border border-slate-500/45 bg-slate-950/30 backdrop-blur-md"
                    >
                      <Link
                        to={`/campaign/${c.id}`}
                        className="min-h-11 flex flex-1 items-center px-4 py-3 font-medium"
                      >
                        {c.name}
                      </Link>
                      <button
                        type="button"
                        className="mr-2 min-h-11 rounded-lg px-3 text-sm text-red-400 hover:text-red-300"
                        onClick={async () => {
                          const confirmed = await confirmAction({
                            title: 'Delete campaign',
                            message: `Delete "${c.name}"?`,
                            confirmLabel: 'Delete',
                            tone: 'danger',
                          });
                          if (!confirmed) return;
                          const id = c.id;
                          setCampaigns((prev) => prev.filter((campaign) => campaign.id !== id));
                          try {
                            await deleteCampaign(id);
                          } catch {
                            refresh();
                            return;
                          }
                          void deleteCampaignFromStorage(id);
                        }}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
