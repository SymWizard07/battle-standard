import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { NATIVE_HOST_NAME } from '../../protocol/constants.js';
import { deployHostBundle } from '../../shared/hostDeploy.js';
import {
  getAppSupportDir,
  getBundledHostDir,
  getFirefoxNativeHostManifestPath,
  getHostLauncherPath,
  getNativeHostManifestPath,
} from './paths.js';

/** Firefox AMO extension id (must match manifest gecko.id). */
export const FIREFOX_EXTENSION_ID = 'battle-standard-save@dev';

export interface RegisterHostOptions {
  extensionId: string;
  launcherPath?: string;
}

export interface RegisterHostResult {
  ok: boolean;
  manifestPath: string;
  launcherPath: string;
  message: string;
}

async function writeNativeManifest(launcherPath: string, extensionId: string): Promise<string> {
  await fs.mkdir(getAppSupportDir(), { recursive: true });
  const manifestPath = getNativeHostManifestPath();
  const manifest = {
    name: NATIVE_HOST_NAME,
    description: 'Battle Standard campaign save helper (native messaging host)',
    path: launcherPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
}

function registerWindows(manifestPath: string): string {
  const hostName = NATIVE_HOST_NAME;
  const resolved = path.resolve(manifestPath);
  const browsers = [
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`,
    `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${hostName}`,
  ];
  const messages: string[] = [];
  for (const regPath of browsers) {
    const result = spawnSync(
      'reg',
      ['add', regPath, '/ve', '/t', 'REG_SZ', '/d', resolved, '/f'],
      { encoding: 'utf8', windowsHide: true },
    );
    if (result.status === 0) {
      messages.push(`Registered ${regPath}`);
    } else {
      messages.push(`Failed ${regPath}: ${result.stderr || result.stdout}`);
    }
  }
  return messages.join('\n');
}

async function registerMacOs(manifestPath: string): Promise<string> {
  const hostName = `${NATIVE_HOST_NAME}.json`;
  const resolved = path.resolve(manifestPath);
  const raw = await fs.readFile(resolved, 'utf8');
  const dirs = [
    path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
    path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'Chromium', 'NativeMessagingHosts'),
  ];
  const messages: string[] = [];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      const target = path.join(dir, hostName);
      await fs.writeFile(target, raw, 'utf8');
      messages.push(`Wrote ${target}`);
    } catch (err) {
      messages.push(`Failed ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return messages.join('\n');
}

async function registerLinux(manifestPath: string): Promise<string> {
  const hostName = `${NATIVE_HOST_NAME}.json`;
  const resolved = path.resolve(manifestPath);
  const home = process.env.HOME ?? '';
  const dirs = [
    path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts'),
    path.join(home, '.config', 'chromium', 'NativeMessagingHosts'),
  ];
  const raw = await fs.readFile(resolved, 'utf8');
  const messages: string[] = [];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      const target = path.join(dir, hostName);
      await fs.writeFile(target, raw, 'utf8');
      messages.push(`Wrote ${target}`);
    } catch (err) {
      messages.push(`Failed ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return messages.join('\n');
}

async function writeFirefoxManifest(launcherPath: string): Promise<string> {
  await fs.mkdir(getAppSupportDir(), { recursive: true });
  const manifestPath = getFirefoxNativeHostManifestPath();
  const manifest = {
    name: NATIVE_HOST_NAME,
    description: 'Battle Standard campaign save helper (native messaging host)',
    path: path.resolve(launcherPath),
    type: 'stdio',
    allowed_extensions: [FIREFOX_EXTENSION_ID],
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
}

function registerFirefoxWindows(manifestPath: string): void {
  const resolved = path.resolve(manifestPath);
  const regPaths = [
    `HKCU\\Software\\Wow6432Node\\Mozilla\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
    `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  ];
  for (const regPath of regPaths) {
    spawnSync(
      'reg',
      ['add', regPath, '/ve', '/t', 'REG_SZ', '/d', resolved, '/f'],
      { encoding: 'utf8', windowsHide: true },
    );
  }
}

async function registerFirefoxMacOrLinux(manifestPath: string): Promise<void> {
  const hostName = `${NATIVE_HOST_NAME}.json`;
  const raw = await fs.readFile(manifestPath, 'utf8');
  const home = process.env.HOME ?? '';
  const dirs =
    process.platform === 'darwin'
      ? [path.join(home, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts')]
      : [path.join(home, '.mozilla', 'native-messaging-hosts')];
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, hostName), raw, 'utf8');
  }
}

/** Register native host for the signed Firefox extension (runs on tray startup). */
export async function registerFirefoxNativeHost(launcherPath: string): Promise<void> {
  const manifestPath = await writeFirefoxManifest(launcherPath);
  if (process.platform === 'win32') {
    registerFirefoxWindows(manifestPath);
  } else {
    await registerFirefoxMacOrLinux(manifestPath);
  }
}

export async function syncBundledHostToInstall(): Promise<string | null> {
  try {
    await fs.access(getHostLauncherPath());
  } catch {
    return null;
  }
  return deployHostBundle(getBundledHostDir(), getAppSupportDir(), process.execPath);
}

export async function registerNativeHost(
  options: RegisterHostOptions,
): Promise<RegisterHostResult> {
  let launcherPath: string;
  if (options.launcherPath) {
    launcherPath = path.resolve(options.launcherPath);
    try {
      await fs.access(launcherPath);
    } catch {
      return {
        ok: false,
        manifestPath: '',
        launcherPath,
        message: `Host launcher not found: ${launcherPath}. Run npm run build in companion/tray first.`,
      };
    }
  } else {
    try {
      await fs.access(getHostLauncherPath());
    } catch {
      const missing = getHostLauncherPath();
      return {
        ok: false,
        manifestPath: '',
        launcherPath: missing,
        message: `Host launcher not found: ${missing}. Run npm run build in companion/tray first.`,
      };
    }
    launcherPath = await syncBundledHostToInstall();
    if (!launcherPath) {
      return {
        ok: false,
        manifestPath: '',
        launcherPath: getHostLauncherPath(),
        message: 'Failed to deploy host bundle.',
      };
    }
  }

  const manifestPath = await writeNativeManifest(launcherPath, options.extensionId);
  let platformMessage = '';
  if (process.platform === 'win32') {
    platformMessage = registerWindows(manifestPath);
  } else if (process.platform === 'darwin') {
    platformMessage = await registerMacOs(manifestPath);
  } else {
    platformMessage = await registerLinux(manifestPath);
  }

  return {
    ok: true,
    manifestPath,
    launcherPath,
    message: platformMessage,
  };
}

/** Read extension id saved by tray (optional). */
export function getSavedExtensionId(): string | null {
  try {
    const configPath = path.join(getAppSupportDir(), 'extension-id.txt');
    const raw = fsSync.readFileSync(configPath, 'utf8').trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function saveExtensionId(extensionId: string): void {
  fsSync.mkdirSync(getAppSupportDir(), { recursive: true });
  fsSync.writeFileSync(path.join(getAppSupportDir(), 'extension-id.txt'), extensionId, 'utf8');
}
