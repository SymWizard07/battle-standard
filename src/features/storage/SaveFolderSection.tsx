import { useCallback, useEffect, useState } from 'react';
import { listCampaigns } from '../../lib/db';
import {
  getUnifiedStorageStatus,
  isCompanionDiskEmpty,
  preferSyncFromDisk,
  pushAllToStorage,
  type UnifiedStorageStatus,
} from '../../lib/companion/companionStorage';
import {
  folderBasename,
  setDivergentWarningDismissed,
  shouldShowDivergentFolderWarning,
} from '../../lib/companion/folderAlignment';
import {
  downloadAllCampaignsBackup,
  isDiskEmpty,
  linkSaveFolder,
  unlinkSaveFolder,
} from '../../lib/stableStorage';
import { ensureWritableAccess } from '../../lib/stableStorage/permissions';
import { loadRootHandle } from '../../lib/stableStorage/handleStore';
import {
  detectDesktopBrowser,
  isChromiumBrowser,
  supportsStableStorage,
} from '../../lib/stableStorage/featureDetect';
import { InlineActionStatus, StorageNotice } from './StorageNotice';
import { SaveHelperInstallPanel, type SaveHelperInstallStep } from './SaveHelperInstallPanel';
import {
  chromiumBrowserFolderGuide,
  companionDisconnectedGuide,
  formatActionError,
  formatActionInfo,
  formatActionSuccess,
  unsupportedBrowserGuide,
  type ActionMessage,
} from './saveHelperCopy';
import { chooseCompanionSaveFolder } from '../../lib/companion/companionBridge';
import { hostSupportsFolderPicker } from './saveHelperInstall';

const btn =
  'min-h-11 rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40';
const btnPrimary = `${btn} bg-sky-600 text-white hover:bg-sky-500`;
const btnSecondary = `${btn} border border-slate-500/50 bg-slate-950/35 text-slate-200 hover:bg-slate-800/50`;

interface Props {
  onStorageChange?: () => void;
  campaignCount: number;
}

function companionReady(status: UnifiedStorageStatus): boolean {
  return (
    status.companion.available &&
    status.companion.connected &&
    status.companion.saveFolder != null &&
    status.companion.error == null
  );
}

function installStep(companion: UnifiedStorageStatus['companion']): SaveHelperInstallStep | null {
  if (!companion?.available) return 'extension';
  if (!companion.connected) return 'setup';
  if (!hostSupportsFolderPicker(companion.hostVersion)) return 'setup';
  if (!companion.saveFolder) return 'folder';
  return null;
}

export function SaveFolderSection({ onStorageChange, campaignCount }: Props) {
  const [unified, setUnified] = useState<UnifiedStorageStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [folderActionStatus, setFolderActionStatus] = useState<ActionMessage | null>(null);
  const [showPushLocal, setShowPushLocal] = useState(false);
  const [showDivergent, setShowDivergent] = useState(false);
  const [flagCopyStatus, setFlagCopyStatus] = useState<string | null>(null);

  const fs = unified?.fsAccess;
  const companion = unified?.companion;

  const refreshStatus = useCallback(async () => {
    const next = await getUnifiedStorageStatus();
    setUnified(next);
    setShowDivergent(
      shouldShowDivergentFolderWarning(
        next.companion.saveFolder,
        next.fsAccess.folderName,
      ),
    );

    let emptyOnDisk = true;
    if (companionReady(next)) {
      emptyOnDisk = await isCompanionDiskEmpty();
    } else if (next.fsAccess.linked && next.fsAccess.permission === 'granted') {
      emptyOnDisk = await isDiskEmpty();
    }
    setShowPushLocal(emptyOnDisk && campaignCount > 0);
  }, [campaignCount]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const supported = supportsStableStorage();
  const companionActive = unified != null && companionReady(unified);

  const onSyncFromFolder = async () => {
    setBusy(true);
    setFolderActionStatus(null);
    const sync = await preferSyncFromDisk({ mode: 'authoritative' });
    if (sync.error) {
      setFolderActionStatus(formatActionError(sync.error));
    } else {
      const via = sync.source === 'companion' ? 'Save Helper' : 'your browser folder';
      setFolderActionStatus(
        formatActionSuccess(
          sync.imported === 0
            ? 'Already up to date — nothing new on disk.'
            : `Imported ${sync.imported} campaign${sync.imported === 1 ? '' : 's'} from ${via}.`,
        ),
      );
    }
    onStorageChange?.();
    await refreshStatus();
    setBusy(false);
  };

  const onLink = async (hintPath?: string | null) => {
    setBusy(true);
    setMessage(null);
    if (hintPath) {
      setMessage(
        formatActionInfo(
          `Choose “${folderBasename(hintPath)}” in the folder picker when prompted.`,
        ),
      );
    }
    const result = await linkSaveFolder();
    if (!result.ok) {
      setMessage(formatActionError(result.error));
      setBusy(false);
      return;
    }

    if (hintPath && folderBasename(hintPath) === result.name) {
      setDivergentWarningDismissed(false);
      setShowDivergent(false);
    }

    const sync = await preferSyncFromDisk({ mode: 'authoritative' });
    if (sync.error) {
      setMessage(formatActionError(sync.error));
    } else if (sync.imported > 0) {
      setMessage(
        formatActionSuccess(
          `Imported ${sync.imported} campaign${sync.imported === 1 ? '' : 's'} from disk.`,
        ),
      );
      onStorageChange?.();
    } else if (hintPath) {
      setMessage(formatActionSuccess('Browser folder now matches Save Helper.'));
    }
    await refreshStatus();
    setBusy(false);
  };

  const onAllow = async () => {
    setBusy(true);
    setMessage(null);
    const handle = await loadRootHandle();
    if (!handle) {
      setBusy(false);
      return;
    }
    const ok = await ensureWritableAccess(handle);
    if (ok) {
      const sync = await preferSyncFromDisk({ mode: 'authoritative' });
      if (sync.error) setMessage(formatActionError(sync.error));
      else setMessage(formatActionSuccess('Folder access restored.'));
      onStorageChange?.();
    } else {
      setMessage(
        formatActionError('Permission denied — saving to folder is paused for this session.'),
      );
    }
    await refreshStatus();
    setBusy(false);
  };

  const onPushLocal = async () => {
    setBusy(true);
    setFolderActionStatus(null);
    const result = await pushAllToStorage();
    if (result.error) {
      setFolderActionStatus(formatActionError(result.error));
    } else {
      setFolderActionStatus(
        formatActionSuccess(
          companionActive
            ? 'Campaigns copied to your Save Helper folder.'
            : 'Campaigns copied to your browser folder.',
        ),
      );
      setShowPushLocal(false);
    }
    await refreshStatus();
    setBusy(false);
  };

  const onUnlink = async () => {
    setBusy(true);
    await unlinkSaveFolder();
    setMessage(null);
    setShowPushLocal(false);
    await refreshStatus();
    setBusy(false);
  };

  const onDownloadBackup = async () => {
    setBusy(true);
    const campaigns = await listCampaigns();
    if (campaigns.length === 0) {
      setMessage(formatActionInfo('No campaigns to export yet.'));
    } else {
      await downloadAllCampaignsBackup();
      setMessage(
        formatActionSuccess('Download started — JSON only (images not included).'),
      );
    }
    setBusy(false);
  };

  const onDismissDivergent = () => {
    setDivergentWarningDismissed(true);
    setShowDivergent(false);
  };

  const disconnected = companionDisconnectedGuide(companion?.error ?? null);
  const browser = detectDesktopBrowser();
  const isFirefox = browser === 'firefox';
  const isChromium = isChromiumBrowser(browser);
  const showSaveHelper = isFirefox || companionActive;
  const showBrowserFolder = isChromium || supported;
  const chromiumGuide = !supported && isChromium ? chromiumBrowserFolderGuide() : null;
  const step = companion ? installStep(companion) : 'extension';
  const folderFallback = unsupportedBrowserGuide();

  const onCopyFlagUrl = async () => {
    if (!chromiumGuide?.flagUrl) return;
    try {
      await navigator.clipboard.writeText(chromiumGuide.flagUrl);
      setFlagCopyStatus('Copied — paste into your browser’s address bar.');
    } catch {
      setFlagCopyStatus('Copy failed — select the address below and copy manually.');
    }
  };

  const onRecheckInstall = () => {
    void refreshStatus();
  };

  const onChooseSaveFolder = async () => {
    setBusy(true);
    setMessage(null);
    const result = await chooseCompanionSaveFolder();
    if (result.error || !result.saveFolder) {
      setMessage(
        formatActionError(result.error ?? 'Folder selection cancelled or unavailable.'),
      );
    } else {
      setMessage(
        formatActionSuccess(`Save folder set to ${folderBasename(result.saveFolder)}.`),
      );
    }
    await refreshStatus();
    setBusy(false);
  };

  return (
    <section className="shrink-0 space-y-5">
      <div>
        <h2 className="text-sm font-medium text-slate-400">Saving &amp; backups</h2>
        <p className="mt-1 text-xs text-slate-500">
          Campaigns always save in this browser. Optional folder setup adds a copy on your computer.
        </p>
      </div>

      {showSaveHelper && (
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Save Helper</h3>
        {!companionActive && step && (
          <SaveHelperInstallPanel
            step={step}
            hostVersion={companion?.hostVersion}
            onRecheck={onRecheckInstall}
            onChooseFolder={() => void onChooseSaveFolder()}
            busy={busy}
          />
        )}
        {!companionActive && step === 'setup' && companion?.error && (
          <StorageNotice
            tone="warning"
            title={disconnected.title}
            steps={disconnected.steps}
            detail={disconnected.detail}
          />
        )}
        {companionActive && companion?.saveFolder && (
          <StorageNotice tone="success" title={`Saving to ${folderBasename(companion.saveFolder)}`}>
            <span className="block truncate opacity-80">{companion.saveFolder}</span>
            {companion.hostVersion && (
              <span className="mt-1 block text-xs opacity-60">Host {companion.hostVersion}</span>
            )}
            <div className="mt-3">
              <button
                type="button"
                className={btnSecondary}
                disabled={busy}
                onClick={() => void onChooseSaveFolder()}
              >
                Change save folder…
              </button>
            </div>
          </StorageNotice>
        )}
      </div>
      )}

      {showBrowserFolder && (
        <div className="space-y-3 border-t border-slate-600/40 pt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Browser folder
          </h3>

          {!supported && chromiumGuide && (
            <div className="space-y-3">
              <StorageNotice tone="info" title={chromiumGuide.title} steps={chromiumGuide.steps}>
                {chromiumGuide.intro}
              </StorageNotice>
              {!chromiumGuide.insecureContext && chromiumGuide.flagUrl && (
                <div className="space-y-2 rounded-xl border border-slate-500/40 bg-slate-950/35 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Settings address
                  </p>
                  <code className="block break-all text-sm text-sky-200">{chromiumGuide.flagUrl}</code>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={btnPrimary} onClick={() => void onCopyFlagUrl()}>
                      Copy settings address
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      disabled={busy}
                      onClick={() => void refreshStatus()}
                    >
                      I enabled it — reload check
                    </button>
                  </div>
                  {flagCopyStatus && (
                    <p className="text-xs text-slate-400" role="status">
                      {flagCopyStatus}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {supported && !fs?.linked && (
            <div className="space-y-3">
              <StorageNotice
                tone="info"
                title={isFirefox ? 'Optional browser backup' : 'Link a save folder'}
              >
                {isFirefox
                  ? 'Link a folder in this browser for saves when Save Helper isn’t available — useful on another computer.'
                  : 'Pick a folder on your computer — campaigns mirror there automatically while you play.'}
              </StorageNotice>
              <button
                type="button"
                className={btnSecondary}
                disabled={busy}
                onClick={() => void onLink()}
              >
                Link folder…
              </button>
            </div>
          )}

          {supported && fs?.linked && fs.permission === 'granted' && (
            <div className="space-y-3">
              <StorageNotice tone="success" title={`Linked: ${fs.folderName}`}>
                {unified?.activeBackend === 'fsAccess' && unified.lastSyncedAt != null && (
                  <span>
                    Last saved{' '}
                    {new Date(unified.lastSyncedAt).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </StorageNotice>
              <button
                type="button"
                className={btnSecondary}
                disabled={busy}
                onClick={() => void onUnlink()}
              >
                Unlink folder
              </button>
            </div>
          )}

          {supported && fs?.linked && fs.permission === 'prompt' && (
            <div className="space-y-3">
              <StorageNotice tone="warning" title="Allow folder access">
                Re-enable saving to <span className="font-medium">{fs.folderName}</span> for this
                session.
              </StorageNotice>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={busy} onClick={() => void onAllow()}>
                  Allow saving
                </button>
                <button type="button" className={btnSecondary} disabled={busy} onClick={() => void onUnlink()}>
                  Unlink
                </button>
              </div>
            </div>
          )}

          {supported && fs?.linked && fs.permission === 'denied' && (
            <div className="space-y-3">
              <StorageNotice tone="warning" title="Folder access denied">
                Saving to <span className="font-medium">{fs.folderName}</span> was blocked.
              </StorageNotice>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={busy} onClick={() => void onLink()}>
                  Choose folder again
                </button>
                <button type="button" className={btnSecondary} disabled={busy} onClick={() => void onUnlink()}>
                  Unlink
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!supported && !isChromium && !companionActive && (
        <div className="space-y-3 border-t border-slate-600/40 pt-4">
          <StorageNotice tone="muted" title={folderFallback.title}>
            {folderFallback.body}
          </StorageNotice>
          <button
            type="button"
            className={btnSecondary}
            disabled={busy || campaignCount === 0}
            onClick={() => void onDownloadBackup()}
          >
            Download backup
          </button>
        </div>
      )}

      {showDivergent && companion?.saveFolder && fs?.folderName && (
        <div className="space-y-3">
          <StorageNotice tone="warning" title="Two different folders">
            Save Helper uses <span className="font-medium">{folderBasename(companion.saveFolder)}</span>{' '}
            but this browser is linked to <span className="font-medium">{fs.folderName}</span>.
            Matching them keeps saves consistent.
          </StorageNotice>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={() => void onLink(companion.saveFolder)}
            >
              Match folders
            </button>
            <button type="button" className={btnSecondary} disabled={busy} onClick={onDismissDivergent}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {(companionActive || (fs?.linked && fs.permission === 'granted')) && (
        <div className="space-y-3 border-t border-slate-600/40 pt-4">
          {showPushLocal && (
            <StorageNotice tone="warning" title="Back up local campaigns">
              Your folder is empty but you have campaigns in this browser. Copy them to disk so
              nothing is lost.
            </StorageNotice>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {showPushLocal && (
              <button
                type="button"
                className={btnPrimary}
                disabled={busy}
                onClick={() => void onPushLocal()}
              >
                Copy to folder
              </button>
            )}
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() => void onSyncFromFolder()}
            >
              Import from folder
            </button>
            {folderActionStatus && <InlineActionStatus message={folderActionStatus} />}
          </div>
        </div>
      )}

      {message && (
        <StorageNotice tone={message.tone} title={message.title} detail={message.detail} />
      )}
    </section>
  );
}
