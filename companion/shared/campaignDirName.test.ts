/**
 * Run: npm run test:companion-disk (included in aggregate)
 */
import {
  campaignFolderName,
  campaignIdFromFolderName,
  folderNameMatchesCampaignId,
  sanitizeCampaignName,
} from './campaignDirName.js';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function testSanitize() {
  assertEqual(sanitizeCampaignName('  Dragon Heist  '), 'Dragon Heist');
  assertEqual(sanitizeCampaignName('Bad:Name?'), 'BadName');
  assertEqual(sanitizeCampaignName('   '), 'Campaign');
}

function testFolderName() {
  assertEqual(campaignFolderName({ id: 'abc-123', name: 'Dragon Heist' }), 'Dragon Heist--abc-123');
}

function testParseFolder() {
  assertEqual(campaignIdFromFolderName('Dragon Heist--abc-123'), 'abc-123');
  assertEqual(campaignIdFromFolderName('legacy-uuid-only'), 'legacy-uuid-only');
  assertEqual(folderNameMatchesCampaignId('Dragon Heist--abc-123', 'abc-123'), true);
  assertEqual(folderNameMatchesCampaignId('legacy-uuid-only', 'legacy-uuid-only'), true);
  assertEqual(folderNameMatchesCampaignId('Other--abc-123', 'xyz'), false);
}

function runTests() {
  testSanitize();
  testFolderName();
  testParseFolder();
  console.log('[automated] companion/shared campaignDirName tests passed');
}

runTests();
