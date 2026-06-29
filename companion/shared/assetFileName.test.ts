/**
 * Automated — asset file naming (ported from web stableStorage tests).
 * Run: npm run test:companion-disk
 */
import { assetFileName, extForAsset, manifestEntryFromPayload } from './assetFileName.js';
import { STORAGE_SCHEMA_VERSION } from './diskLayout.js';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function testExtForAsset() {
  assertEqual(extForAsset({ mimeType: 'image/png', name: 'token.png' }), 'png');
  assertEqual(extForAsset({ mimeType: 'image/jpeg', name: 'map.jpg' }), 'jpg');
  assertEqual(extForAsset({ mimeType: 'application/octet-stream', name: 'file.webp' }), 'webp');
  assertEqual(extForAsset({ mimeType: 'application/octet-stream', name: 'noext' }), 'bin');
}

function testAssetFileName() {
  assertEqual(
    assetFileName('abc123', { mimeType: 'image/png', name: 'Hero.png' }),
    'abc123.png',
  );
}

function testManifestEntryFromPayload() {
  const entry = manifestEntryFromPayload({
    id: 'asset-1',
    name: 'Goblin.png',
    mimeType: 'image/png',
    kind: 'token',
    createdAt: 1000,
  });
  assertEqual(entry.id, 'asset-1');
  assertEqual(entry.file, 'asset-1.png');
  assertEqual(entry.kind, 'token');
  assertEqual(entry.createdAt, 1000);
}

function testStorageSchemaVersion() {
  assert(STORAGE_SCHEMA_VERSION >= 1);
}

function runTests() {
  testExtForAsset();
  testAssetFileName();
  testManifestEntryFromPayload();
  testStorageSchemaVersion();
  console.log('[automated] companion/shared assetFileName tests passed');
}

runTests();
