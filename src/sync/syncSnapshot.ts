import { mergeDrawStrokeDragPreview } from '../lib/drawShapes';
import { defaultPlayerColor } from '../lib/playerColor';
import type {
  Campaign,
  DrawStroke,
  EphemeralDrawText,
  EphemeralMeasurement,
  SceneId,
  TokenGridPlacement,
} from '../lib/types';
import type { CampaignLiveSync } from './liveSyncPayload';

export type LiveSyncState = {
  campaign: Campaign | null;
  activeSceneId: SceneId | null;
  movePreviewPositions: Record<string, TokenGridPlacement> | null;
  scalePreviewById: Record<
    string,
    { footprint: { w: number; h: number }; placement: TokenGridPlacement }
  > | null;
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
  if (state.ephemeralMeasure || state.ephemeralDrawText) {
    return {
      sceneId: state.activeSceneId,
      ephemeralMeasure: state.ephemeralMeasure ?? undefined,
      ephemeralDrawText: state.ephemeralDrawText ?? undefined,
      sessionColor,
      measureVisibleToPlayers: state.measureVisibleToPlayers,
    };
  }
  if (options?.clearEphemeral) {
    return {
      sceneId: state.activeSceneId,
      ephemeralMeasure: null,
      ephemeralDrawText: null,
      sessionColor,
      measureVisibleToPlayers: state.measureVisibleToPlayers,
    };
  }
  return undefined;
}

/** Campaign JSON payload with in-progress drag previews applied for multiplayer sync. */
export function buildCampaignSyncSnapshot(state: LiveSyncState): Campaign | null {
  const { campaign, activeSceneId } = state;
  if (!campaign || !activeSceneId) return campaign;
  const scene = campaign.scenes[activeSceneId];
  if (!scene) return campaign;

  let nextScene = scene;
  let changed = false;

  if (state.movePreviewPositions) {
    nextScene = {
      ...nextScene,
      tokens: nextScene.tokens.map((token) => {
        const placement = state.movePreviewPositions![token.id];
        if (!placement) return token;
        changed = true;
        return {
          ...token,
          gridPos: placement.gridPos,
          posOffset: placement.posOffset,
        };
      }),
    };
  }

  if (state.scalePreviewById) {
    nextScene = {
      ...nextScene,
      tokens: nextScene.tokens.map((token) => {
        const preview = state.scalePreviewById![token.id];
        if (!preview) return token;
        changed = true;
        return {
          ...token,
          footprint: preview.footprint,
          gridPos: preview.placement.gridPos,
          posOffset: preview.placement.posOffset,
        };
      }),
    };
  }

  if (state.drawStrokeDragPreview?.length) {
    const drawStrokes = mergeDrawStrokeDragPreview(
      nextScene.drawStrokes ?? [],
      state.drawStrokeDragPreview,
    );
    changed = true;
    nextScene = { ...nextScene, drawStrokes };
  }

  if (!changed) return campaign;

  return {
    ...campaign,
    scenes: { ...campaign.scenes, [activeSceneId]: nextScene },
    updatedAt: Date.now(),
  };
}
