import type { Campaign, EphemeralDrawText, EphemeralMeasurement, SceneId } from '../lib/types';

export type CampaignLiveSync = {
  sceneId: SceneId;
  ephemeralMeasure?: EphemeralMeasurement | null;
  ephemeralDrawText?: EphemeralDrawText | null;
  sessionColor?: string;
  /** When false, other players should not see the sender's in-progress measurement. */
  measureVisibleToPlayers?: boolean;
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
