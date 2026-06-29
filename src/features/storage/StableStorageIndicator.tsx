import { useCallback, useEffect, useState } from 'react';
import { getUnifiedStorageStatus, type UnifiedStorageStatus } from '../../lib/companion/companionStorage';
import { folderBasename, storageBackendLabel } from '../../lib/companion/folderAlignment';
import { sanitizeCompanionError } from './saveHelperCopy';

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildTitle(status: UnifiedStorageStatus): string {
  const { activeBackend, companion, fsAccess, lastSyncedAt, lastError } = status;

  if (lastError) {
    const short = sanitizeCompanionError(lastError);
    if (short.includes('permission')) return 'Folder permission needed';
    if (short.includes('did not respond')) return 'Save Helper not responding';
    return 'Save issue';
  }

  if (activeBackend === 'companion' && companion.saveFolder) {
    const name = folderBasename(companion.saveFolder);
    if (lastSyncedAt) {
      return `Saving to ${name} · ${formatTime(lastSyncedAt)}`;
    }
    return `Saving to ${name}`;
  }

  if (activeBackend === 'fsAccess' && fsAccess.linked) {
    if (fsAccess.permission !== 'granted') {
      return `${fsAccess.folderName}: permission needed`;
    }
    if (lastSyncedAt) {
      return `${fsAccess.folderName} · ${formatTime(lastSyncedAt)}`;
    }
    return `Saving to ${fsAccess.folderName}`;
  }

  if (companion.available && !companion.connected) {
    return 'Save Helper needs attention';
  }

  return 'Browser only';
}

function buildDetail(status: UnifiedStorageStatus): string | undefined {
  const { activeBackend, companion, fsAccess, lastError } = status;
  const parts: string[] = [];

  parts.push(storageBackendLabel(activeBackend));

  if (lastError) {
    parts.push(sanitizeCompanionError(lastError));
  } else if (activeBackend === 'companion' && companion.saveFolder) {
    parts.push(companion.saveFolder);
  } else if (activeBackend === 'fsAccess' && fsAccess.folderName) {
    parts.push(fsAccess.folderName);
  } else if (companion.available && !companion.connected && companion.error) {
    parts.push(sanitizeCompanionError(companion.error));
  }

  return parts.length > 1 ? parts.join(' · ') : parts[0];
}

export function StableStorageIndicator() {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    const status = await getUnifiedStorageStatus();
    setTitle(buildTitle(status));
    setDetail(buildDetail(status));
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!title) return null;

  return (
    <span
      className="ml-auto shrink-0 text-xs text-slate-500"
      title={detail ?? title}
      aria-label={detail ?? title}
    >
      💾
    </span>
  );
}
