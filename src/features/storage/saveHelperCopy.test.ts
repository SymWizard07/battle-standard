/**
 * Save Helper user-facing copy.
 * Run: npm run test:companion-web
 */
import {
  companionDisconnectedGuide,
  formatActionError,
  sanitizeCompanionError,
} from './saveHelperCopy';

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

function runTests() {
  testSanitizeExtensionId();
  testDisconnectedGuide();
  testFormatActionError();
  console.log('[automated] saveHelperCopy tests passed');
}

runTests();
