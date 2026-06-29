import { useEffect } from 'react';
import { loadCampaignAssets } from '../lib/db';
import { GLOBAL_CAMPAIGN_ID } from '../lib/types';
import { useStore } from '../store/useStore';

export function useGlobalAssets(enabled = true) {
  const registerAssetUrl = useStore((s) => s.registerAssetUrl);

  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      const assets = await loadCampaignAssets(GLOBAL_CAMPAIGN_ID);
      const existing = useStore.getState().assetUrls;
      for (const a of assets) {
        if (!existing[a.id]) {
          registerAssetUrl(a.id, URL.createObjectURL(a.blob));
        }
      }
    })();
  }, [enabled, registerAssetUrl]);
}
