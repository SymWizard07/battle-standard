import Dexie, { type Table } from 'dexie';
import type { Campaign, TokenLibraryLayout } from './types';
import { GLOBAL_CAMPAIGN_ID } from './types';

export interface StoredAsset {
  id: string;
  campaignId: string;
  blob: Blob;
  mimeType: string;
  name: string;
  createdAt: number;
  /** Map images uploaded for scene backgrounds — excluded from the token library. */
  kind?: 'map' | 'token';
}

export interface StoredTokenLibraryLayout {
  scopeId: string;
  layout: TokenLibraryLayout;
}

export interface StoredRootHandle {
  id: 'root';
  handle: FileSystemDirectoryHandle;
}

class BattleMapDB extends Dexie {
  campaigns!: Table<Campaign, string>;
  assets!: Table<StoredAsset, string>;
  tokenLibraryLayouts!: Table<StoredTokenLibraryLayout, string>;
  storageRoot!: Table<StoredRootHandle, string>;

  constructor() {
    super('BattleMapDB');
    this.version(1).stores({
      campaigns: 'id, updatedAt',
      assets: 'id, campaignId',
    });
    this.version(2).stores({
      campaigns: 'id, updatedAt',
      assets: 'id, campaignId',
      tokenLibraryLayouts: 'scopeId',
    });
    this.version(3).stores({
      campaigns: 'id, updatedAt',
      assets: 'id, campaignId',
      tokenLibraryLayouts: 'scopeId',
      storageRoot: 'id',
    });
  }
}

export const db = new BattleMapDB();

export async function saveCampaign(campaign: Campaign): Promise<void> {
  await db.campaigns.put({ ...campaign, updatedAt: Date.now() });
}

export async function loadCampaign(id: string): Promise<Campaign | undefined> {
  return db.campaigns.get(id);
}

export async function listCampaigns(): Promise<Campaign[]> {
  return db.campaigns.orderBy('updatedAt').reverse().toArray();
}

export async function deleteCampaign(id: string): Promise<void> {
  await db.transaction('rw', [db.campaigns, db.assets], async () => {
    await db.campaigns.delete(id);
    await db.assets.where('campaignId').equals(id).delete();
  });
}

export async function saveAsset(asset: StoredAsset): Promise<void> {
  await db.assets.put(asset);
}

export async function deleteAsset(id: string): Promise<void> {
  await db.assets.delete(id);
}

export async function loadAsset(id: string): Promise<StoredAsset | undefined> {
  return db.assets.get(id);
}

export async function loadCampaignAssets(campaignId: string): Promise<StoredAsset[]> {
  return db.assets.where('campaignId').equals(campaignId).toArray();
}

export async function loadTokenLibraryLayout(
  scopeId: string,
): Promise<TokenLibraryLayout | undefined> {
  const row = await db.tokenLibraryLayouts.get(scopeId);
  return row?.layout;
}

export async function saveTokenLibraryLayout(
  scopeId: string,
  layout: TokenLibraryLayout,
): Promise<void> {
  await db.tokenLibraryLayouts.put({ scopeId, layout });
}

export async function importCampaignBundle(
  campaign: Campaign,
  assets: StoredAsset[],
): Promise<void> {
  await db.transaction('rw', [db.campaigns, db.assets], async () => {
    await db.campaigns.put(campaign);
    await db.assets.where('campaignId').equals(campaign.id).delete();
    for (const asset of assets) {
      await db.assets.put(asset);
    }
  });
}

export type DiskImportMode = 'merge' | 'authoritative';

/** When mode is merge, keep local IndexedDB data if it is newer than disk. */
export function shouldImportCampaignFromDisk(
  local: Campaign | undefined,
  disk: Campaign,
  mode: DiskImportMode,
): boolean {
  if (mode === 'authoritative') return true;
  if (!local) return true;
  return disk.updatedAt > local.updatedAt;
}

export async function importCampaignBundleFromDisk(
  campaign: Campaign,
  assets: StoredAsset[],
  mode: DiskImportMode = 'merge',
): Promise<boolean> {
  const local = await loadCampaign(campaign.id);
  if (!shouldImportCampaignFromDisk(local, campaign, mode)) return false;
  await importCampaignBundle(campaign, assets);
  return true;
}

export async function importGlobalBundle(
  layout: TokenLibraryLayout | undefined,
  assets: StoredAsset[],
): Promise<void> {
  await db.transaction('rw', [db.assets, db.tokenLibraryLayouts], async () => {
    if (layout) {
      await db.tokenLibraryLayouts.put({ scopeId: GLOBAL_CAMPAIGN_ID, layout });
    }
    await db.assets.where('campaignId').equals(GLOBAL_CAMPAIGN_ID).delete();
    for (const asset of assets) {
      await db.assets.put(asset);
    }
  });
}
