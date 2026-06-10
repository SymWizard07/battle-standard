import { useEffect } from 'react';
import { loadCampaignAssets } from '../lib/db';
import { useStore } from '../store/useStore';

export function useCampaignAssets(campaignId: string | undefined) {
  const registerAssetUrl = useStore((s) => s.registerAssetUrl);
  const revokeAssetUrl = useStore((s) => s.revokeAssetUrl);
  useEffect(() => {
    if (!campaignId) return;

    let cancelled = false;

    void (async () => {
      const assets = await loadCampaignAssets(campaignId);
      if (cancelled) return;
      const existing = useStore.getState().assetUrls;
      for (const a of assets) {
        if (existing[a.id]) continue;
        const url = URL.createObjectURL(a.blob);
        registerAssetUrl(a.id, url);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [campaignId, registerAssetUrl]);

  useEffect(() => {
    return () => {
      Object.keys(useStore.getState().assetUrls).forEach((id) => {
        revokeAssetUrl(id);
      });
    };
  }, [campaignId, revokeAssetUrl]);
}
