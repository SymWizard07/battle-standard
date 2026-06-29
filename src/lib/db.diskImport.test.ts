/**
 * Disk import merge policy — keep newer IndexedDB campaigns when Save Helper mirror failed.
 * Run: npm run test:companion-web (included)
 */
import { createCampaign } from './campaignFactory';
import { shouldImportCampaignFromDisk } from './db';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function testMergeKeepsNewerLocal() {
  const local = createCampaign('Local');
  local.updatedAt = 200;
  const disk = { ...local, name: 'Disk', updatedAt: 100 };
  assertEqual(shouldImportCampaignFromDisk(local, disk, 'merge'), false);
}

function testMergeImportsWhenDiskNewer() {
  const local = createCampaign('Local');
  local.updatedAt = 100;
  const disk = { ...local, name: 'Disk', updatedAt: 200 };
  assertEqual(shouldImportCampaignFromDisk(local, disk, 'merge'), true);
}

function testMergeImportsWhenLocalMissing() {
  const disk = createCampaign('Disk');
  assertEqual(shouldImportCampaignFromDisk(undefined, disk, 'merge'), true);
}

function testAuthoritativeAlwaysImports() {
  const local = createCampaign('Local');
  local.updatedAt = 200;
  const disk = { ...local, name: 'Disk', updatedAt: 100 };
  assertEqual(shouldImportCampaignFromDisk(local, disk, 'authoritative'), true);
}

function runTests() {
  testMergeKeepsNewerLocal();
  testMergeImportsWhenDiskNewer();
  testMergeImportsWhenLocalMissing();
  testAuthoritativeAlwaysImports();
  console.log('[automated] db disk import merge tests passed');
}

runTests();
