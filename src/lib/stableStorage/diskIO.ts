import type { Campaign, TokenLibraryLayout } from '../types';
import { campaignFolderName, folderNameMatchesCampaignId } from '../../../companion/shared/campaignDirName.js';
import { referencedAssetIds } from '../campaignAssets';
import {
  importCampaignBundleFromDisk,
  importGlobalBundle,
  loadCampaign,
  loadCampaignAssets,
  loadTokenLibraryLayout,
  type StoredAsset,
} from '../db';
import { GLOBAL_CAMPAIGN_ID } from '../types';
import { manifestEntryFromStored } from './assetFileName';
import {
  getDirIfExists,
  getOrCreateDir,
  listSubdirNames,
  readBlob,
  readJson,
  removeEntry,
  writeBlob,
  writeJson,
} from './fsOps';
import { loadRootHandle } from './handleStore';
import { ensureWritableAccess } from './permissions';
import type { AssetManifest, GlobalDiskBundle, RootManifest } from './types';
import {
  ASSETS_DIR,
  ASSETS_MANIFEST,
  CAMPAIGN_JSON,
  CAMPAIGNS_DIR,
  GLOBAL_DIR,
  ROOT_MANIFEST_FILE,
  STORAGE_SCHEMA_VERSION,
  TOKEN_LIBRARY_JSON,
} from './types';

async function findCampaignFolderName(
  campaignsDir: FileSystemDirectoryHandle,
  campaignId: string,
): Promise<string | null> {
  const names = await listSubdirNames(campaignsDir);
  for (const name of names) {
    if (folderNameMatchesCampaignId(name, campaignId)) return name;
  }
  return null;
}

async function readAssetsFromDisk(
  assetsDir: FileSystemDirectoryHandle,
): Promise<{ manifest: AssetManifest; blobs: Map<string, Blob> }> {
  const manifest = (await readJson<AssetManifest>(assetsDir, ASSETS_MANIFEST)) ?? {
    assets: [],
  };
  const blobs = new Map<string, Blob>();
  for (const entry of manifest.assets) {
    const blob = await readBlob(assetsDir, entry.file);
    if (blob) blobs.set(entry.id, blob);
  }
  return { manifest, blobs };
}

export async function readGlobalFromDisk(
  root: FileSystemDirectoryHandle,
): Promise<GlobalDiskBundle | null> {
  const globalDir = await getDirIfExists(root, GLOBAL_DIR);
  if (!globalDir) return null;

  const tokenLibrary = await readJson<TokenLibraryLayout>(globalDir, TOKEN_LIBRARY_JSON);
  const assetsDir = await getDirIfExists(globalDir, ASSETS_DIR);
  if (!assetsDir) {
    return { tokenLibrary, assets: [], assetBlobs: new Map() };
  }

  const { manifest, blobs } = await readAssetsFromDisk(assetsDir);
  return { tokenLibrary, assets: manifest.assets, assetBlobs: blobs };
}

export async function readCampaignFromDisk(
  root: FileSystemDirectoryHandle,
  campaignId: string,
): Promise<{ campaign: Campaign; assets: StoredAsset[] } | null> {
  const campaignsDir = await getDirIfExists(root, CAMPAIGNS_DIR);
  if (!campaignsDir) return null;

  const folderName = await findCampaignFolderName(campaignsDir, campaignId);
  if (!folderName) return null;

  let campaignDir: FileSystemDirectoryHandle;
  try {
    campaignDir = await campaignsDir.getDirectoryHandle(folderName);
  } catch {
    return null;
  }

  const campaign = await readJson<Campaign>(campaignDir, CAMPAIGN_JSON);
  if (!campaign) return null;

  const assetsDir = await getDirIfExists(campaignDir, ASSETS_DIR);
  const storedAssets: StoredAsset[] = [];
  if (assetsDir) {
    const { manifest, blobs } = await readAssetsFromDisk(assetsDir);
    for (const entry of manifest.assets) {
      const blob = blobs.get(entry.id);
      if (!blob) continue;
      storedAssets.push({
        id: entry.id,
        campaignId,
        blob,
        mimeType: entry.mimeType,
        name: entry.name,
        createdAt: entry.createdAt,
        ...(entry.kind != null ? { kind: entry.kind } : {}),
      });
    }
  }

  return { campaign, assets: storedAssets };
}

export async function importGlobalFromDisk(root: FileSystemDirectoryHandle): Promise<boolean> {
  const bundle = await readGlobalFromDisk(root);
  if (!bundle) return false;

  const storedAssets: StoredAsset[] = [];
  for (const entry of bundle.assets) {
    const blob = bundle.assetBlobs.get(entry.id);
    if (!blob) continue;
    storedAssets.push({
      id: entry.id,
      campaignId: GLOBAL_CAMPAIGN_ID,
      blob,
      mimeType: entry.mimeType,
      name: entry.name,
      createdAt: entry.createdAt,
      ...(entry.kind != null ? { kind: entry.kind } : {}),
    });
  }

  await importGlobalBundle(bundle.tokenLibrary ?? undefined, storedAssets);
  return true;
}

export async function importCampaignFromDisk(
  root: FileSystemDirectoryHandle,
  campaignId: string,
): Promise<boolean> {
  const bundle = await readCampaignFromDisk(root, campaignId);
  if (!bundle) return false;
  return importCampaignBundleFromDisk(bundle.campaign, bundle.assets);
}

export async function syncFromDisk(): Promise<{ imported: number; error?: string }> {
  const root = await loadRootHandle();
  if (!root) return { imported: 0 };

  const allowed = await ensureWritableAccess(root);
  if (!allowed) return { imported: 0, error: 'Save folder permission required.' };

  try {
    await importGlobalFromDisk(root);

    const campaignsDir = await getDirIfExists(root, CAMPAIGNS_DIR);
    if (!campaignsDir) return { imported: 0 };

    const ids = await listSubdirNames(campaignsDir);
    let imported = 0;
    for (const folderName of ids) {
      const campaignDir = await campaignsDir.getDirectoryHandle(folderName);
      const campaign = await readJson<Campaign>(campaignDir, CAMPAIGN_JSON);
      if (!campaign) continue;
      const ok = await importCampaignFromDisk(root, campaign.id);
      if (ok) imported += 1;
    }
    return { imported };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync from folder failed.';
    return { imported: 0, error: message };
  }
}

export async function syncCampaignFromDisk(campaignId: string): Promise<boolean> {
  const root = await loadRootHandle();
  if (!root) return false;
  const allowed = await ensureWritableAccess(root);
  if (!allowed) return false;
  return importCampaignFromDisk(root, campaignId);
}

export async function syncGlobalFromDisk(): Promise<boolean> {
  const root = await loadRootHandle();
  if (!root) return false;
  const allowed = await ensureWritableAccess(root);
  if (!allowed) return false;
  return importGlobalFromDisk(root);
}

export async function isDiskEmpty(): Promise<boolean> {
  const root = await loadRootHandle();
  if (!root) return true;

  const allowed = await ensureWritableAccess(root);
  if (!allowed) return true;

  const manifest = await readJson<RootManifest>(root, ROOT_MANIFEST_FILE);
  if (manifest && manifest.campaigns.length > 0) return false;

  const campaignsDir = await getDirIfExists(root, CAMPAIGNS_DIR);
  if (campaignsDir) {
    const ids = await listSubdirNames(campaignsDir);
    if (ids.length > 0) return false;
  }

  const globalDir = await getDirIfExists(root, GLOBAL_DIR);
  if (globalDir) {
    const assetsDir = await getDirIfExists(globalDir, ASSETS_DIR);
    if (assetsDir) {
      const manifest = await readJson<AssetManifest>(assetsDir, ASSETS_MANIFEST);
      if (manifest && manifest.assets.length > 0) return false;
    }
    const layout = await readJson(globalDir, TOKEN_LIBRARY_JSON);
    if (layout) return false;
  }

  return true;
}

export async function deleteCampaignFromDisk(campaignId: string): Promise<void> {
  const root = await loadRootHandle();
  if (!root) return;
  const allowed = await ensureWritableAccess(root);
  if (!allowed) return;

  const campaignsDir = await getDirIfExists(root, CAMPAIGNS_DIR);
  if (!campaignsDir) return;

  const folderName = await findCampaignFolderName(campaignsDir, campaignId);
  if (folderName) {
    await removeEntry(campaignsDir, folderName);
  }

  const manifest =
    (await readJson<RootManifest>(root, ROOT_MANIFEST_FILE)) ?? {
      version: STORAGE_SCHEMA_VERSION,
      campaigns: [],
      lastSyncedAt: 0,
    };
  manifest.campaigns = manifest.campaigns.filter((id) => id !== campaignId);
  manifest.lastSyncedAt = Date.now();
  await writeJson(root, ROOT_MANIFEST_FILE, manifest);
}

/** Export helpers used by syncToDisk — write campaign assets folder. */
export async function writeCampaignAssetsToDisk(
  campaignDir: FileSystemDirectoryHandle,
  campaignId: string,
  assetIds: Set<string>,
): Promise<void> {
  const assetsDir = await getOrCreateDir(campaignDir, ASSETS_DIR);
  const assets = await loadCampaignAssets(campaignId);
  const relevant = assets.filter((a) => assetIds.has(a.id));
  const manifest: AssetManifest = {
    assets: relevant.map((a) => manifestEntryFromStored(a)),
  };
  await writeJson(assetsDir, ASSETS_MANIFEST, manifest);
  for (const asset of relevant) {
    const entry = manifest.assets.find((e) => e.id === asset.id);
    if (!entry) continue;
    await writeBlob(assetsDir, entry.file, asset.blob);
  }
}

export async function writeCampaignJsonToDisk(
  root: FileSystemDirectoryHandle,
  campaignId: string,
): Promise<void> {
  const campaign = await loadCampaign(campaignId);
  if (!campaign) return;

  const campaignsDir = await getOrCreateDir(root, CAMPAIGNS_DIR);
  const folderName = campaignFolderName(campaign);
  const previousFolder = await findCampaignFolderName(campaignsDir, campaignId);
  const campaignDir = await getOrCreateDir(campaignsDir, folderName);
  await writeJson(campaignDir, CAMPAIGN_JSON, campaign);
  await writeCampaignAssetsToDisk(campaignDir, campaignId, referencedAssetIds(campaign));
  if (previousFolder && previousFolder !== folderName) {
    await removeEntry(campaignsDir, previousFolder);
  }
}

export async function writeGlobalToDisk(root: FileSystemDirectoryHandle): Promise<void> {
  const globalDir = await getOrCreateDir(root, GLOBAL_DIR);
  const layout = await loadTokenLibraryLayout(GLOBAL_CAMPAIGN_ID);
  if (layout) {
    await writeJson(globalDir, TOKEN_LIBRARY_JSON, layout);
  }

  const assetsDir = await getOrCreateDir(globalDir, ASSETS_DIR);
  const assets = await loadCampaignAssets(GLOBAL_CAMPAIGN_ID);
  const manifest: AssetManifest = {
    assets: assets.map((a) => manifestEntryFromStored(a)),
  };
  await writeJson(assetsDir, ASSETS_MANIFEST, manifest);
  for (const asset of assets) {
    const entry = manifest.assets.find((e) => e.id === asset.id);
    if (!entry) continue;
    await writeBlob(assetsDir, entry.file, asset.blob);
  }
}

export async function writeRootManifest(root: FileSystemDirectoryHandle): Promise<void> {
  const campaignsDir = await getDirIfExists(root, CAMPAIGNS_DIR);
  const folderNames = campaignsDir ? await listSubdirNames(campaignsDir) : [];
  const campaignIds: string[] = [];
  if (campaignsDir) {
    for (const folder of folderNames) {
      const campaignDir = await campaignsDir.getDirectoryHandle(folder);
      const campaign = await readJson<Campaign>(campaignDir, CAMPAIGN_JSON);
      if (campaign?.id) campaignIds.push(campaign.id);
    }
  }
  const manifest: RootManifest = {
    version: STORAGE_SCHEMA_VERSION,
    campaigns: campaignIds,
    lastSyncedAt: Date.now(),
  };
  await writeJson(root, ROOT_MANIFEST_FILE, manifest);
}
