const DIVERGENT_DISMISS_KEY = 'battle-map-storage-divergent-dismissed';

let dismissOverride: boolean | null = null;

/** @internal Test hook — localStorage unavailable in Node test runner. */
export function __setDivergentDismissForTests(value: boolean | null): void {
  dismissOverride = value;
}

/** Last path segment of a save folder (companion path or FS handle name). */
export function folderBasename(pathOrName: string): string {
  const normalized = pathOrName.replace(/\\/g, '/').replace(/\/+$/, '');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/** True when both backends are linked but folder names do not match. */
export function foldersMayDiverge(
  companionSaveFolder: string | null,
  fsFolderName: string | null,
): boolean {
  if (!companionSaveFolder?.trim() || !fsFolderName?.trim()) return false;
  return folderBasename(companionSaveFolder) !== fsFolderName.trim();
}

export function isDivergentWarningDismissed(): boolean {
  if (dismissOverride !== null) return dismissOverride;
  try {
    return localStorage.getItem(DIVERGENT_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDivergentWarningDismissed(dismissed: boolean): void {
  try {
    if (dismissed) localStorage.setItem(DIVERGENT_DISMISS_KEY, '1');
    else localStorage.removeItem(DIVERGENT_DISMISS_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export function shouldShowDivergentFolderWarning(
  companionSaveFolder: string | null,
  fsFolderName: string | null,
): boolean {
  if (isDivergentWarningDismissed()) return false;
  return foldersMayDiverge(companionSaveFolder, fsFolderName);
}

export function storageBackendLabel(
  backend: 'companion' | 'fsAccess' | 'idbOnly',
): string {
  switch (backend) {
    case 'companion':
      return 'Save Helper';
    case 'fsAccess':
      return 'Browser folder';
    default:
      return 'Browser only';
  }
}
