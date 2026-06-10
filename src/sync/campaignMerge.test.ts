/**
 * Run with: npx tsx src/sync/campaignMerge.test.ts
 */
import { createCampaign, createScene } from '../lib/campaignFactory';
import type { DrawStroke, MeasurementObject, Token } from '../lib/types';
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
      token('gm', 'gm', 5),
      token('player', 'player', 2),
    ]);
    const { campaign: remote } = campaignWithTokens([
      token('gm', 'gm', 1),
      token('player', 'player', 2),
    ]);
    local.updatedAt = 200;
    remote.updatedAt = 100;
    const merged = mergeCampaignForSync(local, remote, 'player', {
      preserveLocalUnlockedGmTokens: true,
      localUpdatedAt: local.updatedAt,
      remoteUpdatedAt: remote.updatedAt,
    });
    const tokens = merged.scenes[sceneId]!.tokens;
    assert(tokens.find((t) => t.id === 'gm')!.gridPos.col === 5);
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

  {
    const playerStroke: DrawStroke = {
      id: 'stroke-player',
      kind: 'line',
      color: '#f00',
      strokeWidth: 2,
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      createdBy: { role: 'player', name: 'Alice' },
    };
    const { campaign: local, sceneId } = campaignWithTokens([token('gm', 'gm', 1)]);
    const { campaign: remote } = campaignWithTokens([token('gm', 'gm', 1)]);
    local.scenes[sceneId]!.drawStrokes = [];
    remote.scenes[sceneId]!.drawStrokes = [playerStroke];
    const merged = mergeCampaignForSync(local, remote, 'gm');
    assert(merged.scenes[sceneId]!.drawStrokes?.length === 1);
    assert(merged.scenes[sceneId]!.drawStrokes?.[0]?.id === 'stroke-player');
  }

  {
    const playerStroke: DrawStroke = {
      id: 'stroke-player',
      kind: 'line',
      color: '#f00',
      strokeWidth: 2,
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      createdBy: { role: 'player', name: 'Alice' },
    };
    const { campaign: local, sceneId } = campaignWithTokens([token('gm', 'gm', 1)]);
    const { campaign: remote } = campaignWithTokens([token('gm', 'gm', 1)]);
    local.scenes[sceneId]!.drawStrokes = [playerStroke];
    remote.scenes[sceneId]!.drawStrokes = [];
    const merged = mergeCampaignForSync(local, remote, 'gm');
    assert(merged.scenes[sceneId]!.drawStrokes?.length === 0);
  }

  {
    const playerMeasure: MeasurementObject = {
      id: 'measure-player',
      kind: 'line',
      color: '#0f0',
      params: { from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
      pinnedBy: { role: 'player', name: 'Alice' },
    };
    const { campaign: local, sceneId } = campaignWithTokens([token('gm', 'gm', 1)]);
    const { campaign: remote } = campaignWithTokens([token('gm', 'gm', 1)]);
    local.scenes[sceneId]!.measurements = [];
    remote.scenes[sceneId]!.measurements = [playerMeasure];
    const merged = mergeCampaignForSync(local, remote, 'gm');
    assert(merged.scenes[sceneId]!.measurements.length === 1);
    assert(merged.scenes[sceneId]!.measurements[0]!.id === 'measure-player');
  }

  {
    const playerStroke: DrawStroke = {
      id: 'stroke-player',
      kind: 'line',
      color: '#f00',
      strokeWidth: 2,
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      createdBy: { role: 'player', name: 'Alice' },
    };
    const { campaign: local, sceneId } = campaignWithTokens([token('player', 'player', 2)]);
    const { campaign: remote } = campaignWithTokens([token('player', 'player', 2)]);
    local.scenes[sceneId]!.drawStrokes = [playerStroke];
    remote.scenes[sceneId]!.drawStrokes = [];
    local.updatedAt = 200;
    remote.updatedAt = 100;
    const merged = mergeCampaignForSync(local, remote, 'player', {
      preserveLocalUnlockedGmTokens: true,
      localUpdatedAt: local.updatedAt,
      remoteUpdatedAt: remote.updatedAt,
    });
    assert(merged.scenes[sceneId]!.drawStrokes?.length === 1);
    assert(merged.scenes[sceneId]!.drawStrokes?.[0]?.id === 'stroke-player');
  }

  console.log('campaignMerge tests passed');
}

runTests();
