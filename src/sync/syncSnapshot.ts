import { defaultPlayerColor } from '../lib/playerColor';
import type {
  Campaign,
  DrawStroke,
  EphemeralDrawText,
  EphemeralMeasurement,
  SceneId,
  TokenGridPlacement,
} from '../lib/types';
import type { TokenScalePreview } from '../lib/tokenScale';
import type { CampaignLiveSync } from './liveSyncPayload';

export type LiveSyncState = {
  campaign: Campaign | null;
  activeSceneId: SceneId | null;
  movePreviewPositions: Record<string, TokenGridPlacement> | null;
  scalePreviewById: Record<string, TokenScalePreview> | null;
  drawStrokeDragPreview: DrawStroke[] | null;
  ephemeralMeasure: EphemeralMeasurement | null;
  ephemeralDrawText: EphemeralDrawText | null;
  measureVisibleToPlayers: boolean;
  playerName: string;
  drawHue: number | null;
};

export function hasLivePreviews(state: LiveSyncState): boolean {
  return Boolean(
    state.movePreviewPositions ||
      state.drawStrokeDragPreview ||
      state.scalePreviewById ||
      state.ephemeralMeasure ||
      state.ephemeralDrawText,
  );
}

export function buildLiveSyncEnvelope(
  state: LiveSyncState,
  options?: { clearEphemeral?: boolean },
): CampaignLiveSync | undefined {
  if (!state.activeSceneId) return undefined;
  const sessionColor = defaultPlayerColor(state.playerName, state.drawHue ?? 0);
  const clear = Boolean(options?.clearEphemeral);
  const hasEphemeral = Boolean(state.ephemeralMeasure || state.ephemeralDrawText);
  const hasTokenLive = Boolean(
    state.movePreviewPositions ||
      state.scalePreviewById ||
      state.drawStrokeDragPreview,
  );
  if (!hasEphemeral && !hasTokenLive && !clear) return undefined;

  return {
    sceneId: state.activeSceneId,
    issuedAt: Date.now(),
    ephemeralMeasure: state.ephemeralMeasure
      ? state.ephemeralMeasure
      : clear
        ? null
        : undefined,
    ephemeralDrawText: state.ephemeralDrawText
      ? state.ephemeralDrawText
      : clear
        ? null
        : undefined,
    movePreviewPositions: state.movePreviewPositions
      ? state.movePreviewPositions
      : clear
        ? null
        : undefined,
    scalePreviewById: state.scalePreviewById
      ? state.scalePreviewById
      : clear
        ? null
        : undefined,
    drawStrokeDragPreview: state.drawStrokeDragPreview
      ? state.drawStrokeDragPreview
      : clear
        ? null
        : undefined,
    sessionColor,
    measureVisibleToPlayers: state.measureVisibleToPlayers,
  };
}

/**
 * Campaign JSON for sync. Live drag previews are sent via liveSync envelope —
 * do not bake them into committed campaign token positions.
 */
export function buildCampaignSyncSnapshot(state: LiveSyncState): Campaign | null {
  return state.campaign;
}
