import type { DiskImportMode } from '../db';
import type { StableStorageStatus } from '../stableStorage';
import { syncFromDisk } from '../stableStorage/diskIO';
import {
  deleteCampaignViaCompanion,
  getCompanionStatus,
  importCampaignFromCompanion,
  importGlobalFromCompanion,
  isCompanionReady,
  listCampaignsViaCompanion,
  loadGlobalViaCompanion,
  saveCampaignViaCompanion,
  saveGlobalViaCompanion,
  syncFromCompanion,
  type CompanionStatus,
} from './companionBridge';

export type StorageBackend = 'companion' | 'fsAccess' | 'idbOnly';

export type UnifiedStorageStatus = {
  activeBackend: StorageBackend;
  companion: CompanionStatus;
  fsAccess: StableStorageStatus;
  lastSyncedAt: number | null;
  lastError: string | null;
};

let lastSyncedAt: number | null = null;
let lastError: string | null = null;

let companionReadyOverride: boolean | null = null;

type MirrorDeps = {
  mirrorCompanion: (campaignId: string) => Promise<void>;
  mirrorFs: (campaignId: string) => Promise<void>;
  mirrorGlobalCompanion: () => Promise<void>;
  mirrorGlobalFs: () => Promise<void>;
};

let mirrorDeps: MirrorDeps | null = null;

type SyncDeps = {
  fromCompanion: (mode: DiskImportMode) => Promise<{ imported: number; error?: string }>;
  fromFs: (mode: DiskImportMode) => Promise<{ imported: number; error?: string }>;
};

let syncDeps: SyncDeps | null = null;

type StatusDeps = {
  getFsStatus: () => Promise<StableStorageStatus>;
};

let statusDeps: StatusDeps | null = null;

/** @internal Test hook */
export function __setCompanionReadyForTests(value: boolean | null): void {
  companionReadyOverride = value;
}

/** @internal Test hook */
export function __setMirrorDepsForTests(deps: Partial<MirrorDeps> | null): void {
  mirrorDeps = deps ? { ...defaultMirrorDeps(), ...deps } : null;
}

/** @internal Test hook */
export function __setSyncDepsForTests(deps: Partial<SyncDeps> | null): void {
  syncDeps = deps ? { ...defaultSyncDeps(), ...deps } : null;
}

/** @internal Test hook */
export function __setStatusDepsForTests(deps: Partial<StatusDeps> | null): void {
  statusDeps = deps ? { ...defaultStatusDeps(), ...deps } : null;
}

function defaultMirrorDeps(): MirrorDeps {
  return {
    mirrorCompanion: mirrorCampaignToCompanion,
    mirrorFs: async (campaignId) => {
      const { syncToDisk } = await import('../stableStorage');
      await syncToDisk(campaignId);
    },
    mirrorGlobalCompanion: mirrorGlobalToCompanion,
    mirrorGlobalFs: async () => {
      const { syncGlobalToDisk } = await import('../stableStorage');
      await syncGlobalToDisk();
    },
  };
}

function getMirrorDeps(): MirrorDeps {
  return mirrorDeps ?? defaultMirrorDeps();
}

function defaultSyncDeps(): SyncDeps {
  return {
    fromCompanion: syncFromCompanion,
    fromFs: syncFromDisk,
  };
}
function getSyncDeps(): SyncDeps {
  return syncDeps ?? defaultSyncDeps();
}

function defaultStatusDeps(): StatusDeps {
  return {
    getFsStatus: async () => import('../stableStorage').then((m) => m.getStableStorageStatus()),
  };
}

function getStatusDeps(): StatusDeps {
  return statusDeps ?? defaultStatusDeps();
}

export async function checkCompanionReady(): Promise<boolean> {
  if (companionReadyOverride !== null) return companionReadyOverride;
  return isCompanionReady();
}

export function recordCompanionSyncSuccess(): void {
  lastSyncedAt = Date.now();
  lastError = null;
}

export function recordCompanionSyncError(err: unknown): void {
  lastError = err instanceof Error ? err.message : 'Companion mirror failed.';
}

export async function getUnifiedStorageStatus(): Promise<UnifiedStorageStatus> {
  const [companion, fsAccess] = await Promise.all([
    getCompanionStatus(),
    getStatusDeps().getFsStatus(),
  ]);

  const companionActive =
    companion.available &&
    companion.connected &&
    companion.saveFolder != null &&
    companion.error == null;

  const activeBackend: StorageBackend = companionActive
    ? 'companion'
    : fsAccess.linked
      ? 'fsAccess'
      : 'idbOnly';

  return {
    activeBackend,
    companion,
    fsAccess,
    lastSyncedAt: lastSyncedAt ?? fsAccess.lastSyncedAt,
    lastError: lastError ?? fsAccess.lastError,
  };
}

export type { DiskImportMode } from '../db';

/** Disk import: merge keeps newer IndexedDB data; authoritative always applies disk. */
export async function preferSyncFromDisk(options?: {
  mode?: DiskImportMode;
}): Promise<{
  imported: number;
  error?: string;
  source?: StorageBackend;
}> {
  const mode = options?.mode ?? 'merge';

  if (await checkCompanionReady()) {
    const result = await getSyncDeps().fromCompanion(mode);
    if (!result.error) {
      lastSyncedAt = Date.now();
      lastError = null;
      return { ...result, source: 'companion' };
    }
    lastError = result.error;
    // Companion failed — fall back to browser folder or IndexedDB-only.
  }

  const result = await getSyncDeps().fromFs(mode);
  if (!result.error) {
    lastSyncedAt = Date.now();
    lastError = null;
  } else {
    lastError = result.error ?? null;
  }
  return { ...result, source: result.imported > 0 || !result.error ? 'fsAccess' : 'idbOnly' };
}

export async function mirrorCampaignToCompanion(campaignId: string): Promise<void> {
  await saveCampaignViaCompanion(campaignId);
  recordCompanionSyncSuccess();
}

export async function mirrorGlobalToCompanion(): Promise<void> {
  await saveGlobalViaCompanion();
  recordCompanionSyncSuccess();
}

export async function syncCampaignFromCompanionDisk(
  campaignId: string,
  mode: DiskImportMode = 'merge',
): Promise<boolean> {
  try {
    const ok = await importCampaignFromCompanion(campaignId, mode);
    if (ok) recordCompanionSyncSuccess();
    return ok;
  } catch (err) {
    recordCompanionSyncError(err);
    return false;
  }
}

export async function syncGlobalFromCompanionDisk(): Promise<boolean> {
  try {
    const ok = await importGlobalFromCompanion();
    if (ok) recordCompanionSyncSuccess();
    return ok;
  } catch (err) {
    recordCompanionSyncError(err);
    return false;
  }
}

/** Import one campaign + global bundle from disk when available. */
export async function preferSyncCampaignFromDisk(
  campaignId: string,
  options?: { mode?: DiskImportMode },
): Promise<void> {
  const mode = options?.mode ?? 'merge';

  if (await checkCompanionReady()) {
    const campaignOk = await syncCampaignFromCompanionDisk(campaignId, mode);
    await syncGlobalFromCompanionDisk();
    if (campaignOk) return;
    // Companion could not import — try browser-linked folder.
  }

  const { syncCampaignFromDisk, syncGlobalFromDisk } = await import('../stableStorage/diskIO');
  await syncCampaignFromDisk(campaignId, mode);
  await syncGlobalFromDisk();
}

export async function isCompanionDiskEmpty(): Promise<boolean> {
  try {
    const ids = await listCampaignsViaCompanion();
    if (ids.length > 0) return false;
    const global = await loadGlobalViaCompanion();
    if (!global) return true;
    if (global.tokenLibrary) return false;
    return global.assets.length === 0;
  } catch {
    return true;
  }
}

export async function pushAllToStorage(): Promise<{ error?: string }> {
  if (await checkCompanionReady()) {
    try {
      const { listCampaigns } = await import('../db');
      const campaigns = await listCampaigns();
      for (const campaign of campaigns) {
        await saveCampaignViaCompanion(campaign.id);
      }
      await saveGlobalViaCompanion();
      recordCompanionSyncSuccess();
      return {};
    } catch (err) {
      recordCompanionSyncError(err);
      const { syncAllToDisk } = await import('../stableStorage');
      return syncAllToDisk();
    }
  }
  const { syncAllToDisk } = await import('../stableStorage');
  return syncAllToDisk();
}

export async function deleteCampaignFromStorage(campaignId: string): Promise<void> {
  const { deleteCampaignFromDisk } = await import('../stableStorage');

  const companionDelete = (async () => {
    if (!(await checkCompanionReady())) return;
    try {
      await deleteCampaignViaCompanion(campaignId);
    } catch (err) {
      recordCompanionSyncError(err);
    }
  })();

  await Promise.all([deleteCampaignFromDisk(campaignId), companionDelete]);
}

export async function runScheduledMirror(campaignId: string): Promise<void> {
  const deps = getMirrorDeps();
  if (await checkCompanionReady()) {
    try {
      await deps.mirrorCompanion(campaignId);
      return;
    } catch (err) {
      recordCompanionSyncError(err);
    }
  }

  await deps.mirrorFs(campaignId);
}

export async function runScheduledGlobalMirror(): Promise<void> {
  const deps = getMirrorDeps();
  if (await checkCompanionReady()) {
    try {
      await deps.mirrorGlobalCompanion();
      return;
    } catch (err) {
      recordCompanionSyncError(err);
    }
  }

  await deps.mirrorGlobalFs();
}
