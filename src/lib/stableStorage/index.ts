import { listCampaigns } from '../db';
import { loadRootHandle } from './handleStore';
import {
  deleteCampaignFromDisk,
  importCampaignFromDisk,
  importGlobalFromDisk,
  isDiskEmpty,
  readCampaignFromDisk,
  syncCampaignFromDisk,
  syncFromDisk,
  syncGlobalFromDisk,
  writeCampaignJsonToDisk,
  writeGlobalToDisk,
  writeRootManifest,
} from './diskIO';
import { ensureWritableAccess, queryWritableAccess, type PermissionState } from './permissions';

export { supportsStableStorage, stableStorageUnsupportedReason } from './featureDetect';
export { linkSaveFolder, unlinkSaveFolder } from './handleStore';

export {
  deleteCampaignFromDisk,
  importCampaignFromDisk,
  importGlobalFromDisk,
  isDiskEmpty,
  syncCampaignFromDisk,
  syncFromDisk,
  syncGlobalFromDisk,
};

export type StableStorageStatus = {
  linked: boolean;
  folderName: string | null;
  permission: PermissionState;
  lastSyncedAt: number | null;
  lastError: string | null;
};

let lastSyncedAt: number | null = null;
let lastError: string | null = null;

let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
let globalMirrorTimer: ReturnType<typeof setTimeout> | null = null;

const MIRROR_DEBOUNCE_MS = 1500;

export function getLastSyncState(): { lastSyncedAt: number | null; lastError: string | null } {
  return { lastSyncedAt, lastError };
}

export async function getStableStorageStatus(): Promise<StableStorageStatus> {
  const handle = await loadRootHandle();
  if (!handle) {
    return {
      linked: false,
      folderName: null,
      permission: 'none',
      lastSyncedAt,
      lastError,
    };
  }

  const permission = await queryWritableAccess(handle);
  return {
    linked: true,
    folderName: handle.name,
    permission,
    lastSyncedAt,
    lastError,
  };
}

export async function syncToDisk(campaignId: string): Promise<void> {
  const root = await loadRootHandle();
  if (!root) return;

  const allowed = await ensureWritableAccess(root);
  if (!allowed) {
    lastError = 'Save folder permission required.';
    return;
  }

  try {
    await writeCampaignJsonToDisk(root, campaignId);
    await writeRootManifest(root);
    lastSyncedAt = Date.now();
    lastError = null;
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'Failed to save to folder.';
  }
}

export async function syncGlobalToDisk(): Promise<void> {
  const root = await loadRootHandle();
  if (!root) return;

  const allowed = await ensureWritableAccess(root);
  if (!allowed) {
    lastError = 'Save folder permission required.';
    return;
  }

  try {
    await writeGlobalToDisk(root);
    lastSyncedAt = Date.now();
    lastError = null;
  } catch (err) {
    lastError = err instanceof Error ? err.message : 'Failed to save global assets to folder.';
  }
}

export async function syncAllToDisk(): Promise<{ error?: string }> {
  const root = await loadRootHandle();
  if (!root) return { error: 'No save folder linked.' };

  const allowed = await ensureWritableAccess(root);
  if (!allowed) return { error: 'Save folder permission required.' };

  try {
    await writeGlobalToDisk(root);
    const campaigns = await listCampaigns();
    for (const c of campaigns) {
      await writeCampaignJsonToDisk(root, c.id);
    }
    await writeRootManifest(root);
    lastSyncedAt = Date.now();
    lastError = null;
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to push local data to folder.';
    lastError = message;
    return { error: message };
  }
}

export function scheduleStableMirror(campaignId: string): void {
  if (mirrorTimer) clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    void import('../companion/companionStorage').then((m) => m.runScheduledMirror(campaignId));
  }, MIRROR_DEBOUNCE_MS);
}

export function scheduleStableGlobalMirror(): void {
  if (globalMirrorTimer) clearTimeout(globalMirrorTimer);
  globalMirrorTimer = setTimeout(() => {
    void import('../companion/companionStorage').then((m) => m.runScheduledGlobalMirror());
  }, MIRROR_DEBOUNCE_MS);
}

export async function downloadCampaignBackup(campaignId: string): Promise<void> {
  const root = await loadRootHandle();
  let campaignJson: string;

  if (root) {
    const bundle = await readCampaignFromDisk(root, campaignId);
    if (bundle) {
      campaignJson = JSON.stringify(bundle.campaign, null, 2);
    } else {
      const { loadCampaign } = await import('../db');
      const c = await loadCampaign(campaignId);
      if (!c) return;
      campaignJson = JSON.stringify(c, null, 2);
    }
  } else {
    const { loadCampaign } = await import('../db');
    const c = await loadCampaign(campaignId);
    if (!c) return;
    campaignJson = JSON.stringify(c, null, 2);
  }

  const blob = new Blob([campaignJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `campaign-${campaignId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAllCampaignsBackup(): Promise<void> {
  const campaigns = await listCampaigns();
  for (const c of campaigns) {
    await downloadCampaignBackup(c.id);
  }
}
