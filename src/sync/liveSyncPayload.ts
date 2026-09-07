import type {
  Campaign,
  DrawStroke,
  EphemeralDrawText,
  EphemeralMeasurement,
  SceneId,
  TokenGridPlacement,
} from '../lib/types';
import type { TokenScalePreview } from '../lib/tokenScale';

export type CampaignLiveSync = {
  sceneId: SceneId;
  /** Wall-clock when this live frame was issued; receivers ignore if older than local campaign.updatedAt. */
  issuedAt?: number;
  ephemeralMeasure?: EphemeralMeasurement | null;
  ephemeralDrawText?: EphemeralDrawText | null;
  /** In-progress token moves; null clears remote live motion for these. */
  movePreviewPositions?: Record<string, TokenGridPlacement> | null;
  scalePreviewById?: Record<string, TokenScalePreview> | null;
  drawStrokeDragPreview?: DrawStroke[] | null;
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
