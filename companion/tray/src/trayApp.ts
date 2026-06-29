import {
  app,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron';
import { loadConfig, saveConfig } from '../../shared/config.js';
import { getSavedExtensionId, registerFirefoxNativeHost, registerNativeHost, saveExtensionId, syncBundledHostToInstall } from './registerHost.js';
import { getTrayIconPath } from './paths.js';
import fsSync from 'node:fs';

let tray: Tray | null = null;

function folderBasename(pathOrName: string): string {
  const normalized = pathOrName.replace(/\\/g, '/').replace(/\/+$/, '');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function trayIcon(): Electron.NativeImage {
  const iconPath = getTrayIconPath();
  if (fsSync.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) return image;
  }
  return nativeImage.createEmpty();
}

function saveFolderLabel(): string {
  const config = loadConfig();
  if (!config.saveFolder) return 'Save folder: not set';
  return `Save folder: ${folderBasename(config.saveFolder)}`;
}

async function chooseSaveFolder(): Promise<void> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose Battle Standard save folder',
  });
  if (result.canceled || result.filePaths.length === 0) return;
  await saveConfig({ saveFolder: result.filePaths[0]! });
  rebuildMenu();
}

async function openSaveFolder(): Promise<void> {
  const config = loadConfig();
  if (!config.saveFolder) {
    await dialog.showMessageBox({
      type: 'info',
      message: 'No save folder configured. Choose a folder first.',
    });
    return;
  }
  await shell.openPath(config.saveFolder);
}

async function registerBrowserConnection(): Promise<void> {
  let extensionId = getSavedExtensionId() ?? '';
  const clip = clipboard.readText().trim();
  if (!extensionId && /^[a-p]{32}$/.test(clip)) {
    extensionId = clip;
  }

  if (!extensionId) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Extension ID needed',
      message: 'Copy your extension ID from chrome://extensions, then:',
      detail:
        '1. Copy the 32-character extension ID to your clipboard\n' +
        '2. Click Register browser connection again\n\n' +
        'Or save it to extension-id.txt in your BattleStandard app-data folder.',
    });
    return;
  }

  saveExtensionId(extensionId);
  const result = await registerNativeHost({ extensionId });
  await dialog.showMessageBox({
    type: result.ok ? 'info' : 'error',
    title: result.ok ? 'Browser connection registered' : 'Registration failed',
    message: result.ok ? 'Native host registered for Chrome/Edge.' : result.message,
    detail: result.ok
      ? `Manifest:\n${result.manifestPath}\n\nLauncher:\n${result.launcherPath}`
      : undefined,
  });
}

function rebuildMenu(): void {
  if (!tray) return;
  const config = loadConfig();
  const menu = Menu.buildFromTemplate([
    { label: 'Battle Standard Save Helper', enabled: false },
    { label: saveFolderLabel(), enabled: false },
    { type: 'separator' },
    {
      label: 'Choose save folder…',
      click: () => {
        void chooseSaveFolder();
      },
    },
    {
      label: 'Open save folder',
      enabled: Boolean(config.saveFolder),
      click: () => {
        void openSaveFolder();
      },
    },
    {
      label: 'Register browser connection…',
      click: () => {
        void registerBrowserConnection();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(
    config.saveFolder
      ? `Battle Standard — ${folderBasename(config.saveFolder)}`
      : 'Battle Standard Save Helper',
  );
}

export function startTrayApp(): void {
  if (tray) return;
  void (async () => {
    const launcherPath = await syncBundledHostToInstall();
    if (launcherPath) {
      try {
        await registerFirefoxNativeHost(launcherPath);
      } catch {
        // Non-fatal — user can re-run register script.
      }
    }
  })();
  const icon = trayIcon();
  if (process.platform === 'darwin' && !icon.isEmpty()) {
    app.dock?.setIcon(icon);
  }
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  rebuildMenu();
}
