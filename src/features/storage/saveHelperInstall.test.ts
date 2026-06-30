/**
 * Save Helper install URLs and platform detection.
 * Run: npm run test:companion-web
 */
import {
  detectSaveHelperPlatform,
  getSaveHelperSetupDownload,
  hostSupportsFolderPicker,
  SAVE_HELPER_RELEASE_TAG,
  SAVE_HELPER_VERSION,
} from './saveHelperInstall';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function testReleaseUrls() {
  assertEqual(SAVE_HELPER_VERSION, '0.1.1');
  assertEqual(SAVE_HELPER_RELEASE_TAG, 'save-helper-v0.1.1');

  const win = getSaveHelperSetupDownload('windows-x64');
  if (!win) throw new Error('expected windows download');
  assertEqual(
    win.url,
    'https://github.com/SymWizard07/battle-standard/releases/download/save-helper-v0.1.1/Battle-Standard-Save-Helper-Setup-0.1.1-portable-x64.exe',
  );
  assertEqual(win.filename, 'Battle-Standard-Save-Helper-Setup-0.1.1-portable-x64.exe');

  const mac = getSaveHelperSetupDownload('macos-arm64');
  if (!mac) throw new Error('expected mac download');
  assertEqual(mac.filename, 'Battle-Standard-Save-Helper-Setup-0.1.1-arm64.dmg');

  const linux = getSaveHelperSetupDownload('linux-x64');
  if (!linux) throw new Error('expected linux download');
  assertEqual(linux.filename, 'Battle-Standard-Save-Helper-Setup-0.1.1-x86_64.AppImage');

  assertEqual(getSaveHelperSetupDownload('unknown'), null);
}

function testHostVersionGate() {
  assertEqual(hostSupportsFolderPicker('0.1.0'), false);
  assertEqual(hostSupportsFolderPicker('0.1.1'), true);
  assertEqual(hostSupportsFolderPicker('0.2.0'), true);
  assertEqual(hostSupportsFolderPicker(null), false);
}

function testPlatformDetection() {
  const original = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
      },
    });
    assertEqual(detectSaveHelperPlatform(), 'windows-x64');

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
      },
    });
    assertEqual(detectSaveHelperPlatform(), 'macos-x64');

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        platform: 'Linux x86_64',
      },
    });
    assertEqual(detectSaveHelperPlatform(), 'linux-x64');
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: original,
    });
  }
}

testReleaseUrls();
testHostVersionGate();
testPlatformDetection();
console.log('[automated] saveHelperInstall tests passed');
