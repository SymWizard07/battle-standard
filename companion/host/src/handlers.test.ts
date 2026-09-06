/**
 * Automated — host v2 session state machine.
 * Run: npm run test:companion-host-handlers
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Campaign } from '../../../src/lib/types.js';
import { encodeSaveCampaignSession } from '../../protocol/session.js';
import { handleHostMessage, handleHostMessages } from './handlers.js';
import { readCampaignFromDisk } from './diskWriter.js';
import { resetSessionsForTests } from './sessionState.js';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function samplePngBase64(): string {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ).toString('base64');
}

function sampleCampaign(): Campaign {
  const sceneId = 'scene-1';
  const assetId = 'asset-map-1';
  return {
    id: 'handler-test-campaign',
    name: 'Handler Test',
    sceneDeck: [{ type: 'scene', sceneId }],
    scenes: {
      [sceneId]: {
        id: sceneId,
        name: 'Scene',
        maps: [
          {
            id: 'layer-1',
            assetId,
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            imageWidth: 100,
            imageHeight: 100,
          },
        ],
        tokens: [],
        fog: { defaultHidden: false, ops: [] },
        measurements: [],
        drawStrokes: [],
      },
    },
    createdAt: 1,
    updatedAt: 2,
  };
}

async function withTempSaveRoot<T>(fn: (saveFolder: string) => Promise<T>): Promise<T> {
  const saveFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bm-handler-'));
  process.env.BM_COMPANION_CONFIG_FILE = path.join(saveFolder, 'config.json');
  await fs.mkdir(path.dirname(process.env.BM_COMPANION_CONFIG_FILE), { recursive: true });
  await fs.writeFile(
    process.env.BM_COMPANION_CONFIG_FILE,
    JSON.stringify({ saveFolder: path.join(saveFolder, 'data') }),
    'utf8',
  );
  await fs.mkdir(path.join(saveFolder, 'data'), { recursive: true });
  try {
    return await fn(path.join(saveFolder, 'data'));
  } finally {
    delete process.env.BM_COMPANION_CONFIG_FILE;
    resetSessionsForTests();
    await fs.rm(saveFolder, { recursive: true, force: true });
  }
}

async function testChunkedSaveCommit() {
  await withTempSaveRoot(async (saveFolder) => {
    const campaign = sampleCampaign();
    const assets = [
      {
        id: 'asset-map-1',
        name: 'Map.png',
        mimeType: 'image/png',
        kind: 'map' as const,
        createdAt: 1000,
        dataBase64: samplePngBase64(),
      },
      {
        id: 'asset-token-1',
        name: 'Token.png',
        mimeType: 'image/png',
        kind: 'token' as const,
        createdAt: 1001,
        dataBase64: samplePngBase64(),
      },
    ];

    const messages = encodeSaveCampaignSession(campaign, assets, 'sess-handler-1');
    const responses = await handleHostMessages(messages);

    const last = responses[responses.length - 1];
    assertEqual(last?.type, 'ok');
    assertEqual(responses.filter((r) => r.type === 'sessionAck').length, messages.length - 1);

    const loaded = await readCampaignFromDisk({ saveFolder }, campaign.id);
    if (!loaded) throw new Error('Campaign not written');
    assertEqual(loaded.assets.length, 1);
  });
}

async function testChunkedLoadStream() {
  await withTempSaveRoot(async (saveFolder) => {
    const campaign = sampleCampaign();
    const assets = [
      {
        id: 'asset-map-1',
        name: 'Map.png',
        mimeType: 'image/png',
        kind: 'map' as const,
        createdAt: 1000,
        dataBase64: samplePngBase64(),
      },
    ];
    await handleHostMessages(encodeSaveCampaignSession(campaign, assets, 'sess-seed'));

    const responses = await handleHostMessages([
      { type: 'loadCampaignBegin', sessionId: 'sess-load', campaignId: campaign.id },
    ]);

    assertEqual(responses[0]?.type, 'loadCampaignData');
    assertEqual(responses[responses.length - 1]?.type, 'loadCampaignComplete');
    assert(responses.some((r) => r.type === 'loadAsset'));
  });
}

async function testIncompletePartsRejected() {
  await withTempSaveRoot(async () => {
    resetSessionsForTests();
    const campaign = sampleCampaign();
    const responses = await handleHostMessages([
      { type: 'saveCampaignBegin', sessionId: 'sess-bad', campaign },
      {
        type: 'saveAssetPart',
        sessionId: 'sess-bad',
        assetId: 'asset-map-1',
        partIndex: 0,
        partCount: 2,
        dataBase64: samplePngBase64().slice(0, 8),
        name: 'Map.png',
        mimeType: 'image/png',
        createdAt: 1000,
      },
      { type: 'saveCampaignCommit', sessionId: 'sess-bad' },
    ]);
    assertEqual(responses[responses.length - 1]?.type, 'error');
  });
}

async function testChooseSaveFolder() {
  await withTempSaveRoot(async (saveFolder) => {
    const picked = path.join(saveFolder, 'picked');
    await fs.mkdir(picked, { recursive: true });
    const response = await handleHostMessage(
      { type: 'chooseSaveFolder' },
      { folderPicker: () => picked },
    );
    assertEqual(response.type, 'status');
    if (response.type !== 'status') throw new Error('expected status');
    assertEqual(response.saveFolder, picked);
  });
}

async function runTests() {
  await testChunkedSaveCommit();
  await testChunkedLoadStream();
  await testIncompletePartsRejected();
  await testChooseSaveFolder();
  console.log('[automated] companion/host handler session tests passed');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
