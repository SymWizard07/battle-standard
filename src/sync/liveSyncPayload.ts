import type { Campaign, EphemeralMeasurement, SceneId } from '../lib/types';

export type CampaignLiveSync = {
  sceneId: SceneId;
  ephemeralMeasure?: EphemeralMeasurement | null;
  sessionColor?: string;
};

export type SyncCampaignPayload = Campaign & {
  liveSync?: CampaignLiveSync;
};

export function stripLiveSync(payload: SyncCampaignPayload): Campaign {
  const { liveSync: _liveSync, ...campaign } = payload;
  return campaign;
}

export function attachLiveSync(
  campaign: Campaign,
  liveSync: CampaignLiveSync | undefined,
): SyncCampaignPayload {
  if (!liveSync) return campaign;
  return { ...campaign, liveSync };
}
