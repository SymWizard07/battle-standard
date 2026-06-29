/**
 * Tray config → host loadConfig integration test.
 * Run: npm run test:companion-tray
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { accessSync } from 'node:fs';
import { loadConfig, saveConfig } from '../shared/config.js';
import { getConfigFilePath } from '../shared/configPaths.js';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'bm-tray-home-'));
  try {
    return await fn(home);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

async function testTrayConfigRoundTrip() {
  await withTempHome(async (home) => {
    const overrides = { home, platform: 'linux' as const };
    const saveFolder = path.join(home, 'Tray Saves');
    await saveConfig({ saveFolder }, overrides);
    const loaded = loadConfig(overrides);
    assertEqual(loaded.saveFolder, saveFolder);
  });
}

async function testHostReadsTrayConfigViaEnv() {
  await withTempHome(async (home) => {
    const overrides = { home, platform: 'linux' as const };
    const saveFolder = path.join(home, 'Integration Saves');
    await saveConfig({ saveFolder }, overrides);
    const configPath = getConfigFilePath(overrides);
    process.env.BM_COMPANION_CONFIG_FILE = configPath;
    const loaded = loadConfig();
    delete process.env.BM_COMPANION_CONFIG_FILE;
    assertEqual(loaded.saveFolder, saveFolder);
  });
}

function testBundledHostExists() {
  const trayRoot = path.join(process.cwd(), 'companion', 'tray');
  const hostMain = path.join(trayRoot, 'resources', 'host', 'main.js');
  try {
    accessSync(hostMain);
    console.log(`[automated] bundled host present: ${hostMain}`);
  } catch {
    console.log('[skip] resources/host/main.js missing — run: npm run companion:tray:build');
  }
}

async function runTests() {
  await testTrayConfigRoundTrip();
  await testHostReadsTrayConfigViaEnv();
  testBundledHostExists();
  console.log('[automated] companion/tray config integration tests passed');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
