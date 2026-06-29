/**
 * Automated — companion asset blob helpers.
 * Run: npm run test:companion-web
 */
import {
  base64ToBlob,
  blobToBase64,
  companionAssetToStored,
  companionAssetsToStored,
} from './companionAssets';
import type { CompanionAssetPayload } from '@companion/protocol';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

async function testBlobBase64RoundTrip() {
  const original = new Blob(['hello companion'], { type: 'text/plain' });
  const encoded = await blobToBase64(original);
  const decoded = base64ToBlob(encoded, 'text/plain');
  assertEqual(await decoded.text(), 'hello companion');
}

function testCompanionAssetToStoredShape() {
  const payload: CompanionAssetPayload = {
    id: 'asset-1',
    name: 'Token.png',
    mimeType: 'image/png',
    kind: 'token',
    createdAt: 1000,
    dataBase64: btoa('png-bytes'),
  };
  const stored = companionAssetToStored(payload, 'campaign-1');
  assertEqual(stored.id, 'asset-1');
  assertEqual(stored.campaignId, 'campaign-1');
  assertEqual(stored.kind, 'token');
  assertEqual(stored.mimeType, 'image/png');
}

function testImportBundleStoredShape() {
  const assets: CompanionAssetPayload[] = [
    {
      id: 'a1',
      name: 'Map.png',
      mimeType: 'image/png',
      kind: 'map',
      createdAt: 1,
      dataBase64: btoa('map'),
    },
    {
      id: 'a2',
      name: 'Hero.png',
      mimeType: 'image/png',
      kind: 'token',
      createdAt: 2,
      dataBase64: btoa('hero'),
    },
  ];
  const stored = companionAssetsToStored(assets, 'camp-x');
  assertEqual(stored.length, 2);
  assertEqual(stored[0]?.campaignId, 'camp-x');
  assertEqual(stored[1]?.id, 'a2');
}

async function runTests() {
  await testBlobBase64RoundTrip();
  testCompanionAssetToStoredShape();
  testImportBundleStoredShape();
  console.log('[automated] companionBridge asset tests passed');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
