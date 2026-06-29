/**
 * Stable storage unit tests — run with: npm run test:stable-storage
 */
function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

import { assetFileName, extForAsset, manifestEntryFromStored } from './assetFileName';
import { STORAGE_SCHEMA_VERSION } from './types';

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

function testManifestEntryFromStored() {
  const entry = manifestEntryFromStored({
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
  testManifestEntryFromStored();
  testStorageSchemaVersion();
  console.log('stableStorage tests passed');
}

runTests();

/**
 * Manual QA checklist (File System Access API — Chrome/Edge):
 * 1. Home → Link save folder → pick empty folder → Push local to folder (if campaigns exist).
 * 2. Create campaign, add map/token → verify campaigns/{id}/campaign.json and assets/ on disk.
 * 3. Reload app → campaigns list and data restored from folder (disk authoritative).
 * 4. Clear site data → re-link same folder → Sync from folder restores campaigns.
 * 5. New session → Allow saving prompt (no folder picker) → edits mirror to disk.
 * 6. Delete campaign → folder removed from campaigns/ on disk.
 * 7. Global token library tab → upload token → verify global/assets/ on disk.
 */
