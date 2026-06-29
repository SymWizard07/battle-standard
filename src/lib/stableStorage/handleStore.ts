import { db } from '../db';
import { supportsStableStorage } from './featureDetect';

const ROOT_ROW_ID = 'root';

export interface StoredRootHandle {
  id: typeof ROOT_ROW_ID;
  handle: FileSystemDirectoryHandle;
}

export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  const row = await db.storageRoot.get(ROOT_ROW_ID);
  return row?.handle ?? null;
}

export async function saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await db.storageRoot.put({ id: ROOT_ROW_ID, handle });
}

export async function clearRootHandle(): Promise<void> {
  await db.storageRoot.delete(ROOT_ROW_ID);
}

export async function getLinkedFolderName(): Promise<string | null> {
  const handle = await loadRootHandle();
  return handle?.name ?? null;
}

export async function linkSaveFolder(): Promise<
  { ok: true; name: string } | { ok: false; error: string }
> {
  if (!supportsStableStorage()) {
    return { ok: false, error: 'Save folder is not supported in this browser.' };
  }

  try {
    const picker = window.showDirectoryPicker;
    if (!picker) {
      return { ok: false, error: 'Save folder is not supported in this browser.' };
    }
    const handle = await picker({ mode: 'readwrite' });
    await saveRootHandle(handle);
    return { ok: true, name: handle.name };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'Folder selection cancelled.' };
    }
    const message = err instanceof Error ? err.message : 'Could not link save folder.';
    return { ok: false, error: message };
  }
}

export async function unlinkSaveFolder(): Promise<void> {
  await clearRootHandle();
}
