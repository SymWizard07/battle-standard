/**
 * Run with: npx tsx src/sync/syncSnapshot.test.ts
 */
import { createCampaign, createScene } from '../lib/campaignFactory';
import type { Token } from '../lib/types';
import { buildCampaignSyncSnapshot, hasLivePreviews } from './syncSnapshot';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function token(id: string, col: number): Token {
  return {
    id,
    name: id,
    gridPos: { col, row: 0 },
    footprint: { w: 1, h: 1 },
    rotation: 0,
    statusEffects: [],
    owner: 'player',
    color: '#fff',
  };
}

function runTests(): void {
  const scene = createScene('Scene');
  scene.id = 'scene-1';
  scene.tokens = [token('t1', 1)];
  const campaign = createCampaign('Camp');
  campaign.scenes['scene-1'] = scene;

  assert(
    !hasLivePreviews({
      campaign,
      activeSceneId: 'scene-1',
      movePreviewPositions: null,
      scalePreviewById: null,
      drawStrokeDragPreview: null,
      ephemeralMeasure: null,
      playerName: 'Player',
      drawHue: 0,
    }),
  );

  const snapshot = buildCampaignSyncSnapshot({
    campaign,
    activeSceneId: 'scene-1',
    movePreviewPositions: { t1: { gridPos: { col: 5, row: 2 } } },
    scalePreviewById: null,
    drawStrokeDragPreview: null,
    ephemeralMeasure: null,
    playerName: 'Player',
    drawHue: 0,
  });
  assert(snapshot!.scenes['scene-1']!.tokens[0]!.gridPos.col === 5);
  assert(snapshot!.updatedAt >= campaign.updatedAt);

  console.log('syncSnapshot tests passed');
}

runTests();
