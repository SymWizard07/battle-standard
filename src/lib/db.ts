import Dexie, { type Table } from 'dexie';
import type { Campaign, TokenLibraryLayout } from './types';

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

class BattleMapDB extends Dexie {
  campaigns!: Table<Campaign, string>;
  assets!: Table<StoredAsset, string>;
  tokenLibraryLayouts!: Table<StoredTokenLibraryLayout, string>;

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
