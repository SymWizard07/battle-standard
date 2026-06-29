import fsSync from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/** Tray package root (dev) or extraResources root (packaged). */
export function getTrayRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  const dir = __dirname;
  const base = path.basename(dir);
  if (base === 'dist' || base === 'src') {
    return path.join(dir, '..');
  }
  return dir;
}

/** Bundled native host directory (main.js + launchers). */
export function getBundledHostDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'host');
  }
  return path.join(getTrayRoot(), 'resources', 'host');
}

export function getBundledHostMainPath(): string {
  return path.join(getBundledHostDir(), 'main.js');
}

export function getHostLauncherPath(): string {
  const hostDir = getBundledHostDir();
  if (process.platform === 'win32') {
    return path.join(hostDir, 'run-host.cmd');
  }
  return path.join(hostDir, 'run-host.sh');
}

/** Tray icon rasterized from public/favicon.svg at build time. */
export function getTrayIconPath(): string {
  const resources = app.isPackaged ? process.resourcesPath : path.join(getTrayRoot(), 'resources');
  if (process.platform === 'win32') {
    const small = path.join(resources, 'icon-16.png');
    if (fsSync.existsSync(small)) return small;
  }
  return path.join(resources, 'icon.png');
}

/** Native messaging manifest written by register flow. */
export function getNativeHostManifestPath(): string {
  return path.join(getAppSupportDir(), 'native-host-manifest.json');
}

export function getFirefoxNativeHostManifestPath(): string {
  return path.join(getAppSupportDir(), 'native-host-manifest-firefox.json');
}

export function getAppSupportDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) return path.join(appData, 'BattleStandard');
    return path.join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming', 'BattleStandard');
  }
  if (process.platform === 'darwin') {
    return path.join(
      process.env.HOME ?? '',
      'Library',
      'Application Support',
      'BattleStandard',
    );
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(process.env.HOME ?? '', '.config');
  return path.join(xdg, 'battle-standard');
}
