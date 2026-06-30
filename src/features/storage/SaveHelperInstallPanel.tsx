import { detectDesktopBrowser } from '../../lib/stableStorage/featureDetect';
import { StorageNotice } from './StorageNotice';
import {
  FIREFOX_EXTENSION_INSTALL_URL,
  firefoxExtensionInstallSteps,
  getSaveHelperSetupDownload,
  SAVE_HELPER_RELEASES_PAGE,
  setupInstallSteps,
} from './saveHelperInstall';

const btn =
  'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40';
const btnPrimary = `${btn} bg-sky-600 text-white hover:bg-sky-500`;
const btnSecondary = `${btn} border border-slate-500/50 bg-slate-950/35 text-slate-200 hover:bg-slate-800/50`;
const linkMuted = 'text-xs text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-300';

export type SaveHelperInstallStep = 'extension' | 'setup' | 'folder';

type Props = {
  step: SaveHelperInstallStep;
  onRecheck: () => void;
  onChooseFolder: () => void;
  busy?: boolean;
};

export function SaveHelperInstallPanel({ step, onRecheck, onChooseFolder, busy }: Props) {
  const browser = detectDesktopBrowser();
  const setup = getSaveHelperSetupDownload();

  if (step === 'extension') {
    if (browser === 'firefox') {
      return (
        <div className="space-y-3">
          <StorageNotice tone="info" title="Step 1 — Install the browser extension" steps={firefoxExtensionInstallSteps()}>
            Save Helper needs a signed Firefox add-on before the native host can connect.
          </StorageNotice>
          <div className="flex flex-wrap items-center gap-2">
            <a href={FIREFOX_EXTENSION_INSTALL_URL} className={btnPrimary} rel="noopener noreferrer">
              Install extension
            </a>
            <button type="button" className={btnSecondary} disabled={busy} onClick={onRecheck}>
              I installed it — check again
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <StorageNotice
          tone="muted"
          title="Step 1 — Install the browser extension"
          steps={[
            'Save Helper currently ships a signed Firefox add-on.',
            'Open this site in Firefox, install the extension, then return here.',
          ]}
        >
          Chrome and Edge builds are not on a store yet — use Firefox for the full Save Helper flow.
        </StorageNotice>
        <a href={FIREFOX_EXTENSION_INSTALL_URL} className={btnSecondary} rel="noopener noreferrer">
          Get Firefox extension
        </a>
      </div>
    );
  }

  if (step === 'setup') {
    const osLabel = setup?.shortOsLabel ?? 'your computer';
    return (
      <div className="space-y-3">
        <StorageNotice tone="success" title="Extension connected">
          The browser add-on is installed.
        </StorageNotice>
        <StorageNotice tone="info" title="Step 2 — Run Save Helper setup" steps={setupInstallSteps(osLabel)}>
          {setup
            ? `One-time setup for ${setup.shortOsLabel} — installs the native host and registers Firefox.`
            : 'Download and run setup once for your platform.'}
        </StorageNotice>
        <div className="flex flex-wrap items-center gap-2">
          {setup ? (
            <a href={setup.url} className={btnPrimary} download={setup.filename}>
              {setup.label}
            </a>
          ) : (
            <a href={SAVE_HELPER_RELEASES_PAGE} className={btnPrimary} rel="noopener noreferrer">
              View setup downloads
            </a>
          )}
          <button type="button" className={btnSecondary} disabled={busy} onClick={onRecheck}>
            I ran setup — check again
          </button>
        </div>
        {setup && (
          <p className="text-xs leading-relaxed text-slate-500">
            Wrong OS?{' '}
            <a href={SAVE_HELPER_RELEASES_PAGE} className={linkMuted} rel="noopener noreferrer">
              See all setup downloads
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <StorageNotice tone="success" title="Native host connected">
        Setup is complete. Choose where campaigns should be saved on your computer.
      </StorageNotice>
      <StorageNotice
        tone="info"
        title="Step 3 — Choose save folder"
        steps={[
          'Click the button below — your operating system folder dialog will open.',
          'Pick or create a folder for Battle Standard saves.',
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} disabled={busy} onClick={onChooseFolder}>
          Choose save folder…
        </button>
        <button type="button" className={btnSecondary} disabled={busy} onClick={onRecheck}>
          Refresh status
        </button>
      </div>
    </div>
  );
}
