export type DesktopBrowser = 'firefox' | 'brave' | 'safari' | 'edge' | 'chrome' | 'other';

type NavigatorWithBrave = Navigator & { brave?: unknown };

/** Best-effort UA sniff for user-facing copy (not security). */
export function detectDesktopBrowser(): DesktopBrowser {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (ua.includes('Firefox') && !ua.includes('Seamonkey')) return 'firefox';
  if (ua.includes('Edg/')) return 'edge';
  if ((navigator as NavigatorWithBrave).brave != null || ua.includes('Brave')) return 'brave';
  if (ua.includes('Chrome')) return 'chrome';
  if (ua.includes('Safari')) return 'safari';
  return 'other';
}

export function saveHelperRequiresFirefox(): boolean {
  return detectDesktopBrowser() !== 'firefox';
}

export function browserDisplayName(browser: DesktopBrowser = detectDesktopBrowser()): string {
  switch (browser) {
    case 'firefox':
      return 'Firefox';
    case 'brave':
      return 'Brave';
    case 'edge':
      return 'Edge';
    case 'chrome':
      return 'Chrome';
    case 'safari':
      return 'Safari';
    default:
      return 'This browser';
  }
}

export function isChromiumBrowser(browser: DesktopBrowser = detectDesktopBrowser()): boolean {
  return browser === 'chrome' || browser === 'edge' || browser === 'brave';
}

/** Internal flags page to enable folder linking when showDirectoryPicker is missing. */
export function chromiumFileSystemFlagUrl(browser: DesktopBrowser = detectDesktopBrowser()): string {
  switch (browser) {
    case 'brave':
      return 'brave://flags/#file-system-access-api';
    case 'edge':
      return 'edge://flags/#file-system-access-api';
    case 'chrome':
      return 'chrome://flags/#file-system-access-api';
    default:
      return 'chrome://flags/#file-system-access-api';
  }
}

export function supportsStableStorage(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function folderLinkUnsupportedMessage(browser: DesktopBrowser): string {
  switch (browser) {
    case 'firefox':
      return 'Firefox cannot link a save folder in the browser. Install Save Helper above, or download a backup below.';
    case 'brave':
    case 'edge':
    case 'chrome':
      return `${browserDisplayName(browser)} needs the File System Access API enabled before you can link a folder — see the steps below.`;
    case 'safari':
      return 'Safari cannot link a save folder for automatic saves in this app. Try Chrome or Edge on desktop, or download a backup below.';
    default:
      return 'This browser cannot link a save folder for automatic saves. Try Chrome or Edge on desktop, or download a backup below.';
  }
}

export function stableStorageUnsupportedReason(): string {
  if (typeof window === 'undefined') return 'Not available in this environment.';
  if (!window.isSecureContext) {
    return 'Save folder requires a secure context (HTTPS or localhost).';
  }
  if (!('showDirectoryPicker' in window)) {
    return folderLinkUnsupportedMessage(detectDesktopBrowser());
  }
  return '';
}
