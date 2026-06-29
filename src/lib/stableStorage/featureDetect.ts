export type DesktopBrowser = 'firefox' | 'safari' | 'edge' | 'chrome' | 'other';

/** Best-effort UA sniff for user-facing copy (not security). */
export function detectDesktopBrowser(): DesktopBrowser {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (ua.includes('Firefox') && !ua.includes('Seamonkey')) return 'firefox';
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('Chrome')) return 'chrome';
  if (ua.includes('Safari')) return 'safari';
  return 'other';
}

export function supportsStableStorage(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function folderLinkUnsupportedMessage(browser: DesktopBrowser): string {
  switch (browser) {
    case 'firefox':
      return 'Firefox cannot link a save folder in the browser. Use Save Helper above (about:debugging → load companion/extension/dist-firefox/manifest.json), or download a backup below.';
    case 'safari':
      return 'Safari cannot link a save folder for automatic saves in this app. Use Save Helper on desktop, open the site in Chrome or Edge, or download a backup below.';
    case 'edge':
      return 'This Microsoft Edge build cannot link a save folder here. Update Edge, use Save Helper above, or download a backup below.';
    case 'chrome':
      return 'This Google Chrome build cannot link a save folder here. Update Chrome, use Save Helper above, or download a backup below.';
    default:
      return 'This browser cannot link a save folder for automatic saves. Use Save Helper above, try Chrome or Edge on desktop, or download a backup below.';
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
