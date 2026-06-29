import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIVE_HOST_NAME } from '../protocol/constants.js';
import {
  deployHostBundle,
  getInstalledHostDir,
  getInstalledLauncherPath,
  writeHostLaunchers,
} from '../shared/hostDeploy.js';

export {
  deployHostBundle,
  getInstalledHostDir,
  getInstalledLauncherPath,
  writeHostLaunchers,
};

export const HOST_NAME = NATIVE_HOST_NAME;

export interface NativeHostManifest {
  name: string;
  description: string;
  path: string;
  type: 'stdio';
  allowed_origins?: string[];
  allowed_extensions?: string[];
}

export function getInstallRoot(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/** Production launcher bundled with the tray app. */
export function getDefaultTrayLauncherPath(): string {
  const hostDir = path.join(getInstallRoot(), '..', 'tray', 'resources', 'host');
  if (process.platform === 'win32') {
    return path.resolve(hostDir, 'run-host.cmd');
  }
  return path.resolve(hostDir, 'run-host.sh');
}

/** Dev launcher — requires `npm run companion:host:build` first. */
export function getDevHostLauncherPath(): string {
  const scriptsDir = path.join(getInstallRoot(), '..', 'host', 'scripts');
  if (process.platform === 'win32') {
    return path.resolve(scriptsDir, 'run-host.cmd');
  }
  return path.resolve(scriptsDir, 'run-host.sh');
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

export function getManifestOutputPath(): string {
  return path.join(getAppSupportDir(), 'native-host-manifest.json');
}

export function buildChromiumManifest(
  launcherPath: string,
  extensionId: string,
): NativeHostManifest {
  return {
    name: HOST_NAME,
    description: 'Battle Standard campaign save helper (native messaging host)',
    path: path.resolve(launcherPath),
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}

/** Firefox uses addon id (e.g. uuid@temporary-addon for unpacked dev builds). */
export function buildFirefoxManifest(
  launcherPath: string,
  extensionId: string,
): NativeHostManifest {
  return {
    name: HOST_NAME,
    description: 'Battle Standard campaign save helper (native messaging host)',
    path: path.resolve(launcherPath),
    type: 'stdio',
    allowed_extensions: [extensionId],
  };
}

export function validateManifest(manifest: NativeHostManifest): string[] {
  const errors: string[] = [];
  if (manifest.name !== HOST_NAME) errors.push(`name must be ${HOST_NAME}`);
  if (manifest.type !== 'stdio') errors.push('type must be stdio');
  if (!path.isAbsolute(manifest.path)) errors.push('path must be absolute');
  const hasOrigins = Array.isArray(manifest.allowed_origins) && manifest.allowed_origins.length > 0;
  const hasExtensions =
    Array.isArray(manifest.allowed_extensions) && manifest.allowed_extensions.length > 0;
  if (!hasOrigins && !hasExtensions) {
    errors.push('allowed_origins or allowed_extensions required');
  }
  if (hasOrigins) {
    for (const origin of manifest.allowed_origins!) {
      if (!origin.startsWith('chrome-extension://') || !origin.endsWith('/')) {
        errors.push(`invalid allowed_origin: ${origin}`);
      }
    }
  }
  return errors;
}

export type RegisterPlatform = 'windows' | 'macos' | 'linux' | 'firefox';

export function registryTargets(platform: RegisterPlatform): string[] {
  const home = process.env.HOME ?? '';
  const hostFile = `${HOST_NAME}.json`;

  switch (platform) {
    case 'windows':
      return [
        `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
        `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
      ];
    case 'macos':
      return [
        path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', hostFile),
        path.join(home, 'Library', 'Application Support', 'Chromium', 'NativeMessagingHosts', hostFile),
      ];
    case 'linux':
      return [
        path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts', hostFile),
        path.join(home, '.config', 'chromium', 'NativeMessagingHosts', hostFile),
      ];
    case 'firefox':
      if (process.platform === 'win32') {
        return [
          `HKCU\\Software\\Wow6432Node\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}`,
          `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${HOST_NAME}`,
        ];
      }
      if (process.platform === 'darwin') {
        return [path.join(home, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts', `${HOST_NAME}.json`)];
      }
      return [path.join(home, '.mozilla', 'native-messaging-hosts', `${HOST_NAME}.json`)];
    default:
      return [];
  }
}
