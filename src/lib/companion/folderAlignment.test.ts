/**
 * Automated — folder alignment helpers.
 * Run: npm run test:companion-web
 */
import {
  folderBasename,
  foldersMayDiverge,
  isDivergentWarningDismissed,
  shouldShowDivergentFolderWarning,
  storageBackendLabel,
  __setDivergentDismissForTests,
} from './folderAlignment';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function testFolderBasename() {
  assertEqual(folderBasename('C:\\Users\\me\\Battle Saves'), 'Battle Saves');
  assertEqual(folderBasename('/home/me/saves/campaigns-root'), 'campaigns-root');
  assertEqual(folderBasename('SimpleName'), 'SimpleName');
}

function testFoldersMayDiverge() {
  assertEqual(
    foldersMayDiverge('C:\\Saves\\MyCampaigns', 'MyCampaigns'),
    false,
  );
  assertEqual(
    foldersMayDiverge('C:\\Saves\\FolderA', 'FolderB'),
    true,
  );
  assertEqual(foldersMayDiverge(null, 'FolderB'), false);
}

function testDismissFlag() {
  __setDivergentDismissForTests(true);
  assertEqual(isDivergentWarningDismissed(), true);
  assertEqual(
    shouldShowDivergentFolderWarning('C:\\A\\One', 'Two'),
    false,
  );
  __setDivergentDismissForTests(false);
  assertEqual(
    shouldShowDivergentFolderWarning('C:\\A\\One', 'Two'),
    true,
  );
  __setDivergentDismissForTests(null);
}

function testStorageBackendLabel() {
  assertEqual(storageBackendLabel('companion'), 'Save Helper');
  assertEqual(storageBackendLabel('fsAccess'), 'Browser folder');
  assertEqual(storageBackendLabel('idbOnly'), 'Browser only');
}

function runTests() {
  testFolderBasename();
  testFoldersMayDiverge();
  testDismissFlag();
  testStorageBackendLabel();
  console.log('[automated] folderAlignment tests passed');
}

runTests();
