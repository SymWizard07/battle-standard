import type { StoredAsset } from './db';
import { sceneMaps } from './sceneMaps';
import type { Campaign } from './types';

export function mapAssetIdsInCampaign(campaign: Campaign | null): Set<string> {
  if (!campaign) return new Set();
  const ids = new Set<string>();
  for (const scene of Object.values(campaign.scenes)) {
    for (const layer of sceneMaps(scene)) {
      ids.add(layer.assetId);
    }
  }
  return ids;
}

export function isTokenLibraryAsset(asset: StoredAsset, mapAssetIds: Set<string>): boolean {
  return asset.kind !== 'map' && !mapAssetIds.has(asset.id);
}

export function isMapAssetId(assetId: string, campaign: Campaign | null): boolean {
  return mapAssetIdsInCampaign(campaign).has(assetId);
}
