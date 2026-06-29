/**
 * Stage 0 — GM multiplayer persist policy tests.
 * Run: npm run test:sync-persist
 */
import {
  shouldFlushPersistOnDisconnect,
  shouldPersistAfterRemoteMerge,
} from './syncRemotePersist';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function testGmMergeTriggersPersist() {
  assertEqual(shouldPersistAfterRemoteMerge('gm', false), true);
}

function testGmMergeSkippedNoPersist() {
  assertEqual(shouldPersistAfterRemoteMerge('gm', true), false);
}

function testPlayerMergeNoPersist() {
  assertEqual(shouldPersistAfterRemoteMerge('player', false), false);
  assertEqual(shouldPersistAfterRemoteMerge('player', true), false);
}

function testGmDisconnectFlush() {
  assertEqual(shouldFlushPersistOnDisconnect('gm', true), true);
  assertEqual(shouldFlushPersistOnDisconnect('gm', false), false);
  assertEqual(shouldFlushPersistOnDisconnect('player', true), false);
  assertEqual(shouldFlushPersistOnDisconnect('player', false), false);
}

function runTests() {
  testGmMergeTriggersPersist();
  testGmMergeSkippedNoPersist();
  testPlayerMergeNoPersist();
  testGmDisconnectFlush();
  console.log('sync-persist tests passed');
}

runTests();
