/**
 * Save Helper user-facing copy.
 * Run: npm run test:companion-web
 */
import {
  chromiumBrowserFolderGuide,
  companionDisconnectedGuide,
  formatActionError,
  sanitizeCompanionError,
} from './saveHelperCopy';
import { chromiumFileSystemFlagUrl } from '../../lib/stableStorage/featureDetect';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function testSanitizeExtensionId() {
  assertEqual(
    sanitizeCompanionError('Global bundle not found. (extension id: battle-standard-save@dev)'),
    'Global bundle not found.',
  );
}

function testDisconnectedGuide() {
  const guide = companionDisconnectedGuide('Receiving end does not exist');
  assertEqual(guide.title, 'Save Helper needs a reload');
  if (!guide.steps?.length) throw new Error('Expected steps');
}

function testFormatActionError() {
  const msg = formatActionError('Save folder permission required.');
  assertEqual(msg.tone, 'warning');
  assertEqual(msg.title, 'Folder permission needed');

  const stale = formatActionError('Unknown message type');
  assertEqual(stale.title, 'Save Helper setup needs an update');

  const ext = formatActionError('Unsupported message type');
  assertEqual(ext.title, 'Save Helper extension needs an update');
}

function testBraveChromiumGuide() {
  const original = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        brave: {},
      },
    });
    assertEqual(chromiumFileSystemFlagUrl('brave'), 'brave://flags/#file-system-access-api');
    const guide = chromiumBrowserFolderGuide();
    assertEqual(guide.title, 'Enable folder saves in Brave');
    assertEqual(guide.flagUrl, 'brave://flags/#file-system-access-api');
    assertEqual(guide.steps.length, 3);
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: original,
    });
  }
}

function runTests() {
  testSanitizeExtensionId();
  testDisconnectedGuide();
  testFormatActionError();
  testBraveChromiumGuide();
  console.log('[automated] saveHelperCopy tests passed');
}

runTests();
