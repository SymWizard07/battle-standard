import { detectDesktopBrowser, type DesktopBrowser } from '../../lib/stableStorage/featureDetect';

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
    case 'chrome':
    case 'edge':
      return [
        'Run the one-time Save Helper setup app',
        'Load the unpacked extension in your browser',
        'Choose a save folder on this page',
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
        body: 'Use Save Helper on desktop, switch to Chrome or Edge, or export a backup below.',
      };
    case 'edge':
      return {
        title: 'This Edge build can’t link a folder',
        body: 'Update Edge, use Save Helper above, or export a backup below.',
      };
    case 'chrome':
      return {
        title: 'This Chrome build can’t link a folder',
        body: 'Update Chrome, use Save Helper above, or export a backup below.',
      };
    default:
      return {
        title: 'Folder linking isn’t available',
        body: 'Try Save Helper, Chrome or Edge on desktop, or export a backup below.',
      };
  }
}

export function formatActionError(raw: string): ActionMessage {
  const text = sanitizeCompanionError(raw);
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
