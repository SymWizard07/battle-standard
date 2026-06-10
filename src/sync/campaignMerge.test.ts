/**
 * Run with: npx tsx src/sync/campaignMerge.test.ts
 */
import { createCampaign, createScene } from '../lib/campaignFactory';
import type { Token } from '../lib/types';
import { mergeCampaignForSync } from './campaignMerge';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function token(id: string, owner: Token['owner'], col: number): Token {
  return {
    id,
    name: id,
    gridPos: { col, row: 0 },
    footprint: { w: 1, h: 1 },
    rotation: 0,
    statusEffects: [],
    owner,
    color: '#fff',
  };
}

function campaignWithTokens(tokens: Token[], sceneId = 'scene-1') {
  const scene = createScene('Scene');
  scene.id = sceneId;
  scene.tokens = tokens;
  const campaign = createCampaign('Camp');
  campaign.scenes[sceneId] = scene;
  campaign.lastActiveSceneId = sceneId;
  return { campaign, sceneId };
}

function runTests(): void {
  {
    const { campaign: local, sceneId } = campaignWithTokens([
      token('gm', 'gm', 1),
      token('player', 'player', 2),
    ]);
    const { campaign: remote } = campaignWithTokens([
      token('gm', 'gm', 9),
      token('player', 'player', 5),
    ]);
    const merged = mergeCampaignForSync(local, remote, 'gm');
    const tokens = merged.scenes[sceneId]!.tokens;
    assert(tokens.find((t) => t.id === 'gm')!.gridPos.col === 9);
    assert(tokens.find((t) => t.id === 'player')!.gridPos.col === 5);
  }

  {
    const lockedGm = { ...token('gm', 'gm', 1), lockedForPlayers: true };
    const { campaign: local, sceneId } = campaignWithTokens([
      lockedGm,
      token('player', 'player', 2),
    ]);
    const { campaign: remote } = campaignWithTokens([
      token('gm', 'gm', 9),
      token('player', 'player', 5),
    ]);
    const merged = mergeCampaignForSync(local, remote, 'gm');
    const tokens = merged.scenes[sceneId]!.tokens;
    assert(tokens.find((t) => t.id === 'gm')!.gridPos.col === 1);
    assert(tokens.find((t) => t.id === 'player')!.gridPos.col === 5);
  }

  {
    const { campaign: local, sceneId } = campaignWithTokens([
      token('gm', 'gm', 1),
      token('player', 'player', 2),
    ]);
    const { campaign: remote } = campaignWithTokens([
      token('gm', 'gm', 9),
      token('player', 'player', 5),
    ]);
    const merged = mergeCampaignForSync(local, remote, 'player');
    const tokens = merged.scenes[sceneId]!.tokens;
    assert(tokens.find((t) => t.id === 'gm')!.gridPos.col === 9);
    assert(tokens.find((t) => t.id === 'player')!.gridPos.col === 2);
  }

  {
    const { campaign: local, sceneId } = campaignWithTokens([
      token('gm', 'gm', 1),
      token('player', 'player', 2),
    ]);
    const { campaign: remote } = campaignWithTokens([token('gm', 'gm', 1)]);
    const merged = mergeCampaignForSync(local, remote, 'player');
    assert(merged.scenes[sceneId]!.tokens.map((t) => t.id).join(',') === 'gm');
  }

  {
    const { campaign: local, sceneId } = campaignWithTokens([
      token('gm', 'gm', 1),
      token('player', 'player', 2),
    ]);
    const { campaign: remote } = campaignWithTokens([
      token('gm', 'gm', 3),
      token('player', 'player', 5),
    ]);
    const merged = mergeCampaignForSync(local, remote, 'gm');
    const tokens = merged.scenes[sceneId]!.tokens;
    assert(tokens.find((t) => t.id === 'gm')!.gridPos.col === 3);
    assert(tokens.find((t) => t.id === 'player')!.gridPos.col === 5);
  }

  console.log('campaignMerge tests passed');
}

runTests();
