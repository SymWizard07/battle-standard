/**
 * Automated — protocol v2 session chunk encode/decode.
 * Run: npm run test:companion-protocol
 */
import { COMPANION_PROTOCOL_VERSION, NATIVE_JSON_MAX_BYTES } from './constants.js';
import {
  assembleLoadCampaignResponses,
  encodeAssetMessages,
  encodeSaveCampaignSession,
  estimateJsonByteLength,
  reassembleAssetParts,
  splitBase64ForParts,
} from './session.js';
import type { CompanionAssetPayload } from './messages.js';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function sampleAsset(overrides: Partial<CompanionAssetPayload> = {}): CompanionAssetPayload {
  return {
    id: 'asset-1',
    name: 'Map.png',
    mimeType: 'image/png',
    kind: 'map',
    createdAt: 1000,
    dataBase64: Buffer.from('hello-world').toString('base64'),
    ...overrides,
  };
}

function testProtocolVersionIsV2() {
  assertEqual(COMPANION_PROTOCOL_VERSION, 2);
}

function testSmallAssetSingleMessage() {
  const messages = encodeAssetMessages('sess-1', sampleAsset());
  assertEqual(messages.length, 1);
  assertEqual(messages[0]?.type, 'saveAsset');
  assert(estimateJsonByteLength(messages[0]) <= NATIVE_JSON_MAX_BYTES);
}

function testOversizedAssetMultiPart() {
  const big = 'A'.repeat(NATIVE_JSON_MAX_BYTES);
  const messages = encodeAssetMessages('sess-2', sampleAsset({ id: 'big', dataBase64: big }));
  assert(messages.length > 1);
  assert(messages.every((m) => m.type === 'saveAssetPart'));
  assert(messages.every((m) => estimateJsonByteLength(m) <= NATIVE_JSON_MAX_BYTES));

  const meta = {
    id: 'big',
    name: 'Map.png',
    mimeType: 'image/png',
    kind: 'map' as const,
    createdAt: 1000,
  };
  const parts = messages.map((m) => {
    if (m.type !== 'saveAssetPart') throw new Error('expected part');
    return m.dataBase64;
  });
  assertEqual(reassembleAssetParts(meta, parts).dataBase64, big);
}

function testSaveCampaignSessionShape() {
  const campaign = {
    id: 'c1',
    name: 'Test',
    sceneDeck: [],
    scenes: {},
    createdAt: 1,
    updatedAt: 2,
  };
  const messages = encodeSaveCampaignSession(campaign, [sampleAsset()], 'sess-3');
  assertEqual(messages[0]?.type, 'saveCampaignBegin');
  assertEqual(messages[messages.length - 1]?.type, 'saveCampaignCommit');
}

function testSplitBase64ForParts() {
  const parts = splitBase64ForParts('abcdefghij', 4);
  assertEqual(parts.join(''), 'abcdefghij');
  assertEqual(parts.length, 3);
}

function testAssembleLoadCampaignResponses() {
  const campaign = {
    id: 'c1',
    name: 'Loaded',
    sceneDeck: [],
    scenes: {},
    createdAt: 1,
    updatedAt: 2,
  };
  const asset = sampleAsset();
  const assembled = assembleLoadCampaignResponses([
    { type: 'loadCampaignData', sessionId: 's', campaign },
    { type: 'loadAsset', sessionId: 's', asset },
    { type: 'loadCampaignComplete', sessionId: 's' },
  ]);
  assertEqual(assembled.campaign.name, 'Loaded');
  assertEqual(assembled.assets.length, 1);
}

function runTests() {
  testProtocolVersionIsV2();
  testSmallAssetSingleMessage();
  testOversizedAssetMultiPart();
  testSaveCampaignSessionShape();
  testSplitBase64ForParts();
  testAssembleLoadCampaignResponses();
  console.log('[automated] companion/protocol session tests passed');
}

runTests();
