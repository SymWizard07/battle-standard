/**
 * Automated — storage router prefers companion vs FS Access.
 * Run: npm run test:companion-web
 */
import {
  __setCompanionReadyForTests,
  __setMirrorDepsForTests,
  __setSyncDepsForTests,
  __setStatusDepsForTests,
  checkCompanionReady,
  getUnifiedStorageStatus,
  preferSyncFromDisk,
  runScheduledMirror,
} from './companionStorage';
import { __setPostToExtensionForTests } from './companionBridge';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

async function testRouterPrefersCompanion() {
  __setCompanionReadyForTests(true);
  let used: 'companion' | 'fs' | null = null;
  __setMirrorDepsForTests({
    mirrorCompanion: async () => {
      used = 'companion';
    },
    mirrorFs: async () => {
      used = 'fs';
    },
  });

  await runScheduledMirror('camp-1');
  assertEqual(used, 'companion');
}

async function testRouterFallsBackToFs() {
  __setCompanionReadyForTests(false);
  let used: 'companion' | 'fs' | null = null;
  __setMirrorDepsForTests({
    mirrorCompanion: async () => {
      used = 'companion';
    },
    mirrorFs: async () => {
      used = 'fs';
    },
  });

  await runScheduledMirror('camp-1');
  assertEqual(used, 'fs');
}

async function testCheckCompanionReadyOverride() {
  __setCompanionReadyForTests(true);
  assertEqual(await checkCompanionReady(), true);
  __setCompanionReadyForTests(false);
  assertEqual(await checkCompanionReady(), false);
  __setCompanionReadyForTests(null);
}

async function testRouterFallsBackToFsOnCompanionError() {
  __setCompanionReadyForTests(true);
  let used: 'companion' | 'fs' | null = null;
  __setMirrorDepsForTests({
    mirrorCompanion: async () => {
      throw new Error('companion save failed');
    },
    mirrorFs: async () => {
      used = 'fs';
    },
  });

  await runScheduledMirror('camp-1');
  assertEqual(used, 'fs');
}

async function testPreferSyncUsesCompanionWhenReady() {
  __setCompanionReadyForTests(true);
  __setSyncDepsForTests({
    fromCompanion: async () => ({ imported: 3 }),
    fromFs: async () => ({ imported: 0, error: 'should not call fs' }),
  });
  const result = await preferSyncFromDisk();
  assertEqual(result.source, 'companion');
  assertEqual(result.imported, 3);
}

async function testPreferSyncFallsBackToFsOnCompanionError() {
  __setCompanionReadyForTests(true);
  __setSyncDepsForTests({
    fromCompanion: async () => ({ imported: 0, error: 'companion sync failed' }),
    fromFs: async () => ({ imported: 2 }),
  });
  const result = await preferSyncFromDisk();
  assertEqual(result.source, 'fsAccess');
  assertEqual(result.imported, 2);
}

async function testPreferSyncFallsBackToFs() {
  __setCompanionReadyForTests(false);
  __setSyncDepsForTests({
    fromCompanion: async () => ({ imported: 99 }),
    fromFs: async () => ({ imported: 2 }),
  });
  const result = await preferSyncFromDisk();
  assertEqual(result.source, 'fsAccess');
  assertEqual(result.imported, 2);
}

async function testUnifiedStatusShape() {
  __setCompanionReadyForTests(false);
  __setPostToExtensionForTests(async (message) => {
    if (message.type === 'getStatus') {
      return {
        type: 'status',
        requestId: message.requestId,
        connected: false,
        saveFolder: null,
        hostVersion: null,
        error: 'Extension unavailable in test',
      };
    }
    return { type: 'error', requestId: message.requestId, error: 'unexpected' };
  });
  __setStatusDepsForTests({
    getFsStatus: async () => ({
      linked: false,
      folderName: null,
      permission: 'none',
      lastSyncedAt: null,
      lastError: null,
    }),
  });
  const status = await getUnifiedStorageStatus();
  __setPostToExtensionForTests(null);
  __setStatusDepsForTests(null);
  if (status.activeBackend !== 'fsAccess' && status.activeBackend !== 'idbOnly') {
    throw new Error(`Unexpected backend ${status.activeBackend}`);
  }
  if (typeof status.companion.available !== 'boolean') {
    throw new Error('companion status missing');
  }
  if (typeof status.fsAccess.linked !== 'boolean') {
    throw new Error('fsAccess status missing');
  }
}

async function testUnifiedStatusCompanionActiveShape() {
  __setPostToExtensionForTests(async (message) => {
    if (message.type === 'getStatus') {
      return {
        type: 'status',
        requestId: message.requestId,
        connected: true,
        saveFolder: 'C:\\Saves\\Campaigns',
        hostVersion: '0.1.0',
        error: null,
      };
    }
    return { type: 'error', requestId: message.requestId, error: 'unexpected' };
  });
  __setStatusDepsForTests({
    getFsStatus: async () => ({
      linked: true,
      folderName: 'OtherFolder',
      permission: 'granted',
      lastSyncedAt: 1000,
      lastError: null,
    }),
  });
  const status = await getUnifiedStorageStatus();
  __setPostToExtensionForTests(null);
  __setStatusDepsForTests(null);
  assertEqual(status.activeBackend, 'companion');
  assertEqual(status.companion.saveFolder, 'C:\\Saves\\Campaigns');
  assertEqual(status.fsAccess.folderName, 'OtherFolder');
}

async function runTests() {
  await testRouterPrefersCompanion();
  await testRouterFallsBackToFs();
  await testRouterFallsBackToFsOnCompanionError();
  await testCheckCompanionReadyOverride();
  await testPreferSyncUsesCompanionWhenReady();
  await testPreferSyncFallsBackToFsOnCompanionError();
  await testPreferSyncFallsBackToFs();
  await testUnifiedStatusShape();
  await testUnifiedStatusCompanionActiveShape();
  __setCompanionReadyForTests(null);
  __setMirrorDepsForTests(null);
  __setSyncDepsForTests(null);
  __setStatusDepsForTests(null);
  console.log('[automated] companionStorage router tests passed');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
