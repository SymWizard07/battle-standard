/**
 * Automated — companion/shared config round-trip.
 * Run: npm run test:companion-disk
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultConfig, loadConfig, saveConfig, type CompanionConfig } from './config.js';
import { getAppDataDir, getConfigFilePath } from './configPaths.js';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'bm-config-home-'));
  try {
    return await fn(home);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

async function testDefaultWhenMissing() {
  await withTempHome(async (home) => {
    const config = loadConfig({ home, platform: 'linux' });
    assertEqual(config.saveFolder, null);
    assertEqual(JSON.stringify(defaultConfig()), JSON.stringify(config));
  });
}

async function testRoundTrip() {
  await withTempHome(async (home) => {
    const overrides = { home, platform: 'linux' as const };
    const saveFolder = path.join(home, 'My Saves');
    await saveConfig({ saveFolder }, overrides);
    const loaded = loadConfig(overrides);
    assertEqual(loaded.saveFolder, saveFolder);
    const configPath = getConfigFilePath(overrides);
    const parsed = JSON.parse(await fs.readFile(configPath, 'utf8')) as CompanionConfig;
    assertEqual(parsed.saveFolder, saveFolder);
  });
}

async function testWindowsAppDataOverride() {
  await withTempHome(async (home) => {
    const appData = path.join(home, 'Roaming');
    await fs.mkdir(appData, { recursive: true });
    const dir = getAppDataDir({ home, platform: 'win32', appData });
    assertEqual(dir, path.join(appData, 'BattleStandard'));
  });
}

async function runTests() {
  await testDefaultWhenMissing();
  await testRoundTrip();
  await testWindowsAppDataOverride();
  console.log('[automated] companion/shared config tests passed');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
