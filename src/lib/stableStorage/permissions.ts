let sessionAccessGranted = false;

export type PermissionState = 'unsupported' | 'none' | 'prompt' | 'granted' | 'denied';

export function resetSessionAccess(): void {
  sessionAccessGranted = false;
}

export async function queryWritableAccess(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  if (!handle.queryPermission) return 'granted';
  const state = await handle.queryPermission({ mode: 'readwrite' });
  if (state === 'granted') sessionAccessGranted = true;
  return state;
}

export async function ensureWritableAccess(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  if (sessionAccessGranted) return true;

  const current = await queryWritableAccess(handle);
  if (current === 'granted') {
    sessionAccessGranted = true;
    return true;
  }
  if (current === 'denied') return false;
  if (!handle.requestPermission) {
    sessionAccessGranted = true;
    return true;
  }

  const requested = await handle.requestPermission({ mode: 'readwrite' });
  if (requested === 'granted') {
    sessionAccessGranted = true;
    return true;
  }
  return false;
}
