/**
 * Install script validation — manifest shape + register wrappers exist.
 * Run: npm run test:companion-install
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildChromiumManifest,
  buildFirefoxManifest,
  getDefaultTrayLauncherPath,
  getInstallRoot,
  registryTargets,
  validateManifest,
} from './lib.js';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function testChromiumManifestValid() {
  const launcher = path.resolve(getInstallRoot(), '..', 'tray', 'resources', 'host', 'run-host.cmd');
  const manifest = buildChromiumManifest(launcher, 'abcdefghijklmnopqrstuvwxyzabcdef');
  assertEqual(validateManifest(manifest).length, 0);
  if (!path.isAbsolute(manifest.path)) {
    throw new Error('manifest.path must be absolute');
  }
}

function testFirefoxManifestValid() {
  const launcher = path.resolve(getInstallRoot(), '..', 'tray', 'resources', 'host', 'run-host.sh');
  const manifest = buildFirefoxManifest(launcher, 'uuid@temporary-addon');
  assertEqual(validateManifest(manifest).length, 0);
  assertEqual(manifest.allowed_extensions?.[0], 'uuid@temporary-addon');
}

function testFirefoxWindowsUsesRegistry() {
  if (process.platform !== 'win32') return;
  const targets = registryTargets('firefox');
  if (targets.length !== 2) throw new Error('expected two Firefox registry targets on Windows');
  if (!targets.some((t) => t.includes('Mozilla\\NativeMessagingHosts'))) {
    throw new Error(`Firefox Windows targets must include Mozilla registry keys, got ${targets.join(', ')}`);
  }
}

function testRegistryTargetsNonEmpty() {
  for (const platform of ['windows', 'macos', 'linux', 'firefox'] as const) {
    const targets = registryTargets(platform);
    if (targets.length === 0) throw new Error(`no targets for ${platform}`);
  }
  testFirefoxWindowsUsesRegistry();
}

function testRegisterScriptsExist() {
  const installRoot = getInstallRoot();
  const required = [
    'register-windows.ps1',
    'register-macos.sh',
    'register-linux.sh',
      'register-firefox.sh',
    'register-firefox.ps1',
    'register-cli.ts',
    'lib.ts',
  ];
  for (const file of required) {
    const full = path.join(installRoot, file);
    if (!fs.existsSync(full)) throw new Error(`missing ${full}`);
    if (fs.statSync(full).size === 0) throw new Error(`empty ${full}`);
  }
}

function testDryRunManifestOutput() {
  const launcher = getDefaultTrayLauncherPath();
  if (!fs.existsSync(launcher)) {
    console.log('[skip] tray launcher not built — run npm run companion:tray:build');
    return;
  }
  const manifest = buildChromiumManifest(launcher, 'abcdefghijklmnopqrstuvwxyzabcdef');
  assertEqual(validateManifest(manifest).length, 0);
  const targets = registryTargets(
    process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
  );
  if (targets.length === 0) throw new Error('expected registration targets');
  console.log('[automated] dry-run manifest validated (absolute path + targets)');
}

function runTests() {
  testChromiumManifestValid();
  testFirefoxManifestValid();
  testRegistryTargetsNonEmpty();
  testRegisterScriptsExist();
  testDryRunManifestOutput();
  console.log('[automated] companion/install scripts tests passed');
}

runTests();
