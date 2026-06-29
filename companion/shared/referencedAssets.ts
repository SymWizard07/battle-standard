import type { Campaign } from '../../src/lib/types.js';

/** Map layers plus token images referenced by the campaign (mirrors src/lib/campaignAssets.ts). */
export function referencedAssetIds(campaign: Campaign | null): Set<string> {
  const ids = new Set<string>();
  if (!campaign) return ids;
  for (const scene of Object.values(campaign.scenes)) {
    for (const layer of scene.maps ?? []) {
      ids.add(layer.assetId);
    }
    for (const token of scene.tokens) {
      if (token.imageAssetId) ids.add(token.imageAssetId);
    }
  }
  return ids;
}
