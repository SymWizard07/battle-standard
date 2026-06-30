import {
  browserDisplayName,
  chromiumFileSystemFlagUrl,
  detectDesktopBrowser,
  type DesktopBrowser,
} from '../../lib/stableStorage/featureDetect';

export type NoticeTone = 'success' | 'warning' | 'info' | 'muted' | 'error';

export type ActionMessage = {
  tone: NoticeTone;
  title: string;
  detail?: string;
};

export function sanitizeCompanionError(raw: string): string {
  return raw.replace(/\s*\(extension id:[^)]+\)/gi, '').trim();
}

export function companionDisconnectedGuide(error: string | null): {
  title: string;
  steps: string[];
  detail?: string;
} {
  const cleaned = error ? sanitizeCompanionError(error) : '';
  if (cleaned.includes('Receiving end does not exist')) {
    return {
      title: 'Save Helper needs a reload',
      steps: [
        'Open about:debugging in Firefox',
        'Reload the temporary Save Helper extension',
        'Refresh this page',
      ],
      detail: cleaned || undefined,
    };
  }
  if (cleaned.includes('did not respond')) {
    return {
      title: 'Save Helper isn’t responding',
      steps: [
        'Check that setup completed successfully',
        'Reload the browser extension',
        'Click “I ran setup — check again” on this page',
      ],
      detail: cleaned || undefined,
    };
  }
  return {
    title: 'Save Helper isn’t connected',
    steps: [
      'Run the Save Helper setup app once for your operating system',
      'Reload the Save Helper extension if you use Firefox',
      'Click “I ran setup — check again” on this page',
    ],
    detail: cleaned || undefined,
  };
}

function installSteps(browser: DesktopBrowser): string[] {
  switch (browser) {
    case 'firefox':
      return [
        'Install the Firefox extension from this page',
        'Run the one-time Save Helper setup app for your OS',
        'Choose a save folder here when prompted',
      ];
    case 'brave':
    case 'chrome':
    case 'edge':
      return [
        'Enable the File System Access API in your browser settings (see Browser folder below).',
        'Reload this page, then click “Link folder…”.',
        'Pick a folder — campaigns mirror there automatically.',
      ];
    default:
      return [
        'Install the Save Helper extension and setup app',
        'Choose a save folder on this page',
      ];
  }
}

export function companionNotInstalledGuide(): { title: string; subtitle: string; steps: string[] } {
  const browser = detectDesktopBrowser();
  return {
    title: 'Save campaigns outside the browser',
    subtitle: 'Optional desktop setup — campaigns still save in this browser without it.',
    steps: installSteps(browser),
  };
}

export function unsupportedBrowserGuide(): {
  title: string;
  body: string;
} {
  switch (detectDesktopBrowser()) {
    case 'firefox':
      return {
        title: 'Firefox uses Save Helper for folder saves',
        body: 'Campaigns stay in this browser. Use Save Helper above or export a backup below.',
      };
    case 'safari':
      return {
        title: 'Safari can’t link a folder here',
        body: 'Try Chrome or Edge on desktop, or export a backup below.',
      };
    default:
      return {
        title: 'Folder linking isn’t available',
        body: 'Try Chrome or Edge on desktop, or export a backup below.',
      };
  }
}

export type ChromiumFolderGuide = {
  title: string;
  intro: string;
  steps: string[];
  flagUrl: string;
  insecureContext: boolean;
};

/** Steps to turn on in-browser folder saves when showDirectoryPicker is missing (common on Brave). */
export function chromiumBrowserFolderGuide(): ChromiumFolderGuide {
  const browser = detectDesktopBrowser();
  const name = browserDisplayName(browser);
  const flagUrl = chromiumFileSystemFlagUrl(browser);

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      title: `${name} needs a secure connection`,
      intro:
        'Folder linking only works on HTTPS (or localhost). Open Battle Standard from the official site link, then try again.',
      steps: [
        'Use https://symwizard07.github.io/battle-standard/ (not an insecure mirror).',
        'Reload this page after the address bar shows a lock icon.',
        'Click “Link folder…” when it appears below.',
      ],
      flagUrl: '',
      insecureContext: true,
    };
  }

  return {
    title: `Enable folder saves in ${name}`,
    intro: `${name} can save campaigns to a folder on your computer — no extension required. Some Chromium browsers ship with folder access turned off until you enable it once.`,
    steps: [
      'Open a new tab, paste the settings address below into the address bar, and press Enter.',
      'Find “File System Access API” and set it to Enabled.',
      `Relaunch ${name}, return to Battle Standard, and click “Link folder…” below.`,
    ],
    flagUrl,
    insecureContext: false,
  };
}

export function formatActionError(raw: string): ActionMessage {
  const text = sanitizeCompanionError(raw);
  if (text.includes('Unknown message type')) {
    return {
      tone: 'warning',
      title: 'Save Helper setup needs an update',
      detail:
        'The native host on your computer is out of date. Download and run the latest Save Helper setup app again, then retry.',
    };
  }
  if (text.includes('Unsupported message type')) {
    return {
      tone: 'warning',
      title: 'Save Helper extension needs an update',
      detail:
        'Your browser extension is out of date. Install Save Helper v0.1.1 or later from Mozilla Add-ons, then reload this page.',
    };
  }
  if (text.includes('permission')) {
    return {
      tone: 'warning',
      title: 'Folder permission needed',
      detail: text,
    };
  }
  if (text.includes('not found') || text.includes('did not respond')) {
    return {
      tone: 'warning',
      title: 'Couldn’t reach Save Helper',
      detail: text,
    };
  }
  return { tone: 'error', title: 'Something went wrong', detail: text };
}

export function formatActionSuccess(text: string): ActionMessage {
  return { tone: 'success', title: text };
}

export function formatActionInfo(text: string): ActionMessage {
  return { tone: 'info', title: text };
}
