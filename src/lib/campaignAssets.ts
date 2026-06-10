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

/** Map layers plus token images referenced by the live campaign. */
export function referencedAssetIds(campaign: Campaign | null): Set<string> {
  const ids = mapAssetIdsInCampaign(campaign);
  if (!campaign) return ids;
  for (const scene of Object.values(campaign.scenes)) {
    for (const token of scene.tokens) {
      if (token.imageAssetId) ids.add(token.imageAssetId);
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
