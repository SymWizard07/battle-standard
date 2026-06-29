import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAppDataDir } from './configPaths.js';

/** Installed host copy under app data (no spaces — safe for native messaging). */
export function getInstalledHostDir(appSupportDir: string = getAppDataDir()): string {
  return path.join(appSupportDir, 'host');
}

export function getInstalledLauncherPath(appSupportDir: string = getAppDataDir()): string {
  const hostDir = getInstalledHostDir(appSupportDir);
  if (process.platform === 'win32') {
    return path.join(hostDir, 'run-host.cmd');
  }
  return path.join(hostDir, 'run-host.sh');
}

export function writeHostLaunchers(hostDir: string, electronExePath?: string): void {
  const resolvedHostDir = path.resolve(hostDir);
  const mainPath = path.join(resolvedHostDir, 'main.js');

  if (process.platform === 'win32') {
    const electronBlock = electronExePath
      ? `set "BATTLE_STANDARD_ELECTRON_NODE=${electronExePath}"\r\nset ELECTRON_RUN_AS_NODE=1\r\n"%BATTLE_STANDARD_ELECTRON_NODE%" "${mainPath}"\r\nexit /b %ERRORLEVEL%\r\n`
      : `if defined BATTLE_STANDARD_ELECTRON_NODE (\r\n  set ELECTRON_RUN_AS_NODE=1\r\n  "%BATTLE_STANDARD_ELECTRON_NODE%" "${mainPath}"\r\n  exit /b %ERRORLEVEL%\r\n)\r\n`;
    const winCmd = `@echo off\r\nsetlocal\r\ncd /d "${resolvedHostDir}"\r\nwhere node >nul 2>nul\r\nif %ERRORLEVEL%==0 (\r\n  node "${mainPath}"\r\n  exit /b %ERRORLEVEL%\r\n)\r\n${electronBlock}echo Node.js not found. Install Node or set BATTLE_STANDARD_ELECTRON_NODE to Electron.exe >&2\r\nexit /b 1\r\n`;
    fsSync.writeFileSync(path.join(resolvedHostDir, 'run-host.cmd'), winCmd, 'utf8');
    return;
  }

  const electronSh = electronExePath
    ? `export BATTLE_STANDARD_ELECTRON_NODE="${electronExePath.replace(/\\/g, '/')}"\nexport ELECTRON_RUN_AS_NODE=1\nexec "$BATTLE_STANDARD_ELECTRON_NODE" "$MAIN"\n`
    : `if [ -n "\${BATTLE_STANDARD_ELECTRON_NODE:-}" ]; then
  export ELECTRON_RUN_AS_NODE=1
  exec "$BATTLE_STANDARD_ELECTRON_NODE" "$MAIN"
fi
`;
  const sh = `#!/usr/bin/env bash
set -euo pipefail
HOST_DIR="${resolvedHostDir.replace(/\\/g, '/')}"
MAIN="${mainPath.replace(/\\/g, '/')}"
cd "$HOST_DIR"
if command -v node >/dev/null 2>&1; then
  exec node "$MAIN"
fi
${electronSh}echo "Node.js not found. Install Node or set BATTLE_STANDARD_ELECTRON_NODE." >&2
exit 1
`;
  const shPath = path.join(resolvedHostDir, 'run-host.sh');
  fsSync.writeFileSync(shPath, sh, 'utf8');
  try {
    fsSync.chmodSync(shPath, 0o755);
  } catch {
    // Windows
  }
}

/** Copy bundled host into app data and return launcher path for manifests. */
export async function deployHostBundle(
  sourceHostDir: string,
  appSupportDir: string = getAppDataDir(),
  electronExePath?: string,
): Promise<string> {
  const installedDir = getInstalledHostDir(appSupportDir);
  await fs.mkdir(installedDir, { recursive: true });

  const mainSrc = path.join(sourceHostDir, 'main.js');
  await fs.copyFile(mainSrc, path.join(installedDir, 'main.js'));

  const mapSrc = path.join(sourceHostDir, 'main.js.map');
  try {
    await fs.copyFile(mapSrc, path.join(installedDir, 'main.js.map'));
  } catch {
    // optional
  }

  writeHostLaunchers(installedDir, electronExePath);
  return getInstalledLauncherPath(appSupportDir);
}
