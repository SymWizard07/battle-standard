import os from 'node:os';
import path from 'node:path';

export interface ConfigPathOverrides {
  home?: string;
  platform?: NodeJS.Platform;
  appData?: string;
  xdgConfigHome?: string;
}

const APP_DIR_NAME = 'BattleStandard';
const CONFIG_FILE_NAME = 'config.json';

/** Application data directory for companion config (not the user save folder). */
export function getAppDataDir(overrides: ConfigPathOverrides = {}): string {
  const platform = overrides.platform ?? process.platform;
  const home = overrides.home ?? os.homedir();

  if (platform === 'win32') {
    const appData = overrides.appData ?? process.env.APPDATA;
    if (appData) return path.join(appData, APP_DIR_NAME);
    return path.join(home, 'AppData', 'Roaming', APP_DIR_NAME);
  }

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_DIR_NAME);
  }

  const xdg =
    overrides.xdgConfigHome ??
    process.env.XDG_CONFIG_HOME ??
    path.join(home, '.config');
  return path.join(xdg, 'battle-standard');
}

export function getConfigFilePath(overrides: ConfigPathOverrides = {}): string {
  if (
    process.env.BM_COMPANION_CONFIG_FILE &&
    Object.keys(overrides).length === 0
  ) {
    return process.env.BM_COMPANION_CONFIG_FILE;
  }
  return path.join(getAppDataDir(overrides), CONFIG_FILE_NAME);
}
