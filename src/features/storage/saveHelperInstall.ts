/** Save Helper release metadata — keep in sync with companion/tray/package.json version. */
export const SAVE_HELPER_VERSION = '0.1.0';
export const SAVE_HELPER_RELEASE_TAG = `save-helper-v${SAVE_HELPER_VERSION}`;
export const GITHUB_REPO = 'SymWizard07/battle-standard';

export const FIREFOX_EXTENSION_INSTALL_URL =
  'https://addons.mozilla.org/firefox/downloads/file/4873162/c499cfaf782b48d1996b-0.1.0.xpi';

export const SAVE_HELPER_RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/tag/${SAVE_HELPER_RELEASE_TAG}`;

export type SaveHelperPlatform =
  | 'windows-x64'
  | 'windows-arm64'
  | 'macos-x64'
  | 'macos-arm64'
  | 'linux-x64'
  | 'linux-arm64'
  | 'unknown';

export type SaveHelperDownload = {
  platform: SaveHelperPlatform;
  label: string;
  shortOsLabel: string;
  filename: string;
  url: string;
  formatLabel: string;
};

function releaseAssetUrl(filename: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/download/${SAVE_HELPER_RELEASE_TAG}/${encodeURIComponent(filename)}`;
}

/** Best-effort OS/arch guess for the setup download button. */
export function detectSaveHelperPlatform(): SaveHelperPlatform {
  if (typeof navigator === 'undefined') return 'unknown';

  const ua = navigator.userAgent;
  const plat = (navigator.platform ?? '').toLowerCase();

  if (/win/i.test(plat) || /windows/i.test(ua)) {
    return /arm64|aarch64|arm;64/i.test(ua) ? 'windows-arm64' : 'windows-x64';
  }

  if (/mac/i.test(plat) || /macintosh/i.test(ua)) {
    if (/arm64|aarch64|mac os x 11|mac os x 12|mac os x 13|mac os x 14|mac os x 15/i.test(ua)) {
      return 'macos-arm64';
    }
    return /intel mac os x/i.test(ua) ? 'macos-x64' : 'macos-arm64';
  }

  if (/linux/i.test(plat) || /linux/i.test(ua) || /x11/i.test(ua)) {
    return /aarch64|arm64|armv8/i.test(ua) ? 'linux-arm64' : 'linux-x64';
  }

  return 'unknown';
}

function setupAssetFilename(platform: SaveHelperPlatform): string | null {
  const v = SAVE_HELPER_VERSION;
  switch (platform) {
    case 'windows-x64':
      return `Battle-Standard-Save-Helper-Setup-${v}-portable-x64.exe`;
    case 'windows-arm64':
      return `Battle-Standard-Save-Helper-Setup-${v}-portable-arm64.exe`;
    case 'macos-x64':
      return `Battle-Standard-Save-Helper-Setup-${v}-x64.dmg`;
    case 'macos-arm64':
      return `Battle-Standard-Save-Helper-Setup-${v}-arm64.dmg`;
    case 'linux-x64':
      return `Battle-Standard-Save-Helper-Setup-${v}-x86_64.AppImage`;
    case 'linux-arm64':
      return `Battle-Standard-Save-Helper-Setup-${v}-arm64.AppImage`;
    default:
      return null;
  }
}

const PLATFORM_META: Record<
  Exclude<SaveHelperPlatform, 'unknown'>,
  { label: string; shortOsLabel: string; formatLabel: string }
> = {
  'windows-x64': {
    label: 'Run setup for Windows (64-bit)',
    shortOsLabel: 'Windows 64-bit',
    formatLabel: 'Portable setup .exe',
  },
  'windows-arm64': {
    label: 'Run setup for Windows (ARM)',
    shortOsLabel: 'Windows ARM',
    formatLabel: 'Portable setup .exe',
  },
  'macos-x64': {
    label: 'Run setup for Mac (Intel)',
    shortOsLabel: 'macOS Intel',
    formatLabel: 'Setup .dmg',
  },
  'macos-arm64': {
    label: 'Run setup for Mac (Apple Silicon)',
    shortOsLabel: 'macOS Apple Silicon',
    formatLabel: 'Setup .dmg',
  },
  'linux-x64': {
    label: 'Run setup for Linux (64-bit)',
    shortOsLabel: 'Linux 64-bit',
    formatLabel: 'Setup AppImage',
  },
  'linux-arm64': {
    label: 'Run setup for Linux (ARM)',
    shortOsLabel: 'Linux ARM',
    formatLabel: 'Setup AppImage',
  },
};

export function getSaveHelperSetupDownload(
  platform: SaveHelperPlatform = detectSaveHelperPlatform(),
): SaveHelperDownload | null {
  if (platform === 'unknown') return null;
  const filename = setupAssetFilename(platform);
  if (!filename) return null;
  const meta = PLATFORM_META[platform];
  return {
    platform,
    filename,
    url: releaseAssetUrl(filename),
    ...meta,
  };
}

/** @deprecated Use getSaveHelperSetupDownload */
export const getSaveHelperDownload = getSaveHelperSetupDownload;

export function firefoxExtensionInstallSteps(): string[] {
  return [
    'Click Install extension below — Firefox will ask to confirm.',
    'Choose Add (or Allow) when prompted.',
    'Click “I installed it — check again” when the add-on is enabled.',
  ];
}

export function setupInstallSteps(osLabel: string): string[] {
  return [
    `Download and run the setup app for ${osLabel}.`,
    'Confirm when setup reports Firefox registration is complete.',
    'Return here and click “I ran setup — check again”.',
  ];
}

export function chooseSaveFolderSteps(): string[] {
  return [
    'Click “Choose save folder…” — your system folder dialog will open.',
    'Pick or create a folder for Battle Standard saves.',
  ];
}
