import { build } from 'esbuild';
import { cpSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const trayRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(trayRoot, '..', '..');
const faviconSvg = join(repoRoot, 'public', 'favicon.svg');
const resourcesDir = join(trayRoot, 'resources');
const hostRoot = join(trayRoot, '..', 'host');
const hostDist = join(hostRoot, 'dist', 'main.js');
const resourcesHost = join(trayRoot, 'resources', 'host');
const dist = join(trayRoot, 'dist');

async function writeTrayIcon() {
  mkdirSync(resourcesDir, { recursive: true });
  const icon32 = join(resourcesDir, 'icon.png');
  const icon16 = join(resourcesDir, 'icon-16.png');
  const icon256 = join(resourcesDir, 'icon-256.png');
  const icon512 = join(resourcesDir, 'icon-512.png');
  await sharp(faviconSvg).resize(32, 32).png().toFile(icon32);
  await sharp(faviconSvg).resize(16, 16).png().toFile(icon16);
  await sharp(faviconSvg).resize(256, 256).png().toFile(icon256);
  await sharp(faviconSvg).resize(512, 512).png().toFile(icon512);
}

function runHostBuild() {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: hostRoot,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error('companion/host build failed');
  }
}

function copyBundledHost() {
  mkdirSync(resourcesHost, { recursive: true });
  cpSync(hostDist, join(resourcesHost, 'main.js'));
  const map = join(hostRoot, 'dist', 'main.js.map');
  try {
    cpSync(map, join(resourcesHost, 'main.js.map'));
  } catch {
    // optional
  }
}

function writeLaunchers() {
  const hostDir = resolve(resourcesHost);
  const mainPath = join(hostDir, 'main.js');

  const winCmd = `@echo off\r\nsetlocal\r\ncd /d "${hostDir}"\r\nwhere node >nul 2>nul\r\nif %ERRORLEVEL%==0 (\r\n  node "${mainPath}"\r\n  exit /b %ERRORLEVEL%\r\n)\r\nif defined BATTLE_STANDARD_ELECTRON_NODE (\r\n  set ELECTRON_RUN_AS_NODE=1\r\n  "%BATTLE_STANDARD_ELECTRON_NODE%" "${mainPath}"\r\n  exit /b %ERRORLEVEL%\r\n)\r\necho Node.js not found. Install Node or set BATTLE_STANDARD_ELECTRON_NODE to Electron.exe >&2\r\nexit /b 1\r\n`;
  writeFileSync(join(resourcesHost, 'run-host.cmd'), winCmd, 'utf8');

  const sh = `#!/usr/bin/env bash
set -euo pipefail
HOST_DIR="${hostDir.replace(/\\/g, '/')}"
MAIN="${mainPath.replace(/\\/g, '/')}"
cd "$HOST_DIR"
if command -v node >/dev/null 2>&1; then
  exec node "$MAIN"
fi
if [ -n "\${BATTLE_STANDARD_ELECTRON_NODE:-}" ]; then
  export ELECTRON_RUN_AS_NODE=1
  exec "$BATTLE_STANDARD_ELECTRON_NODE" "$MAIN"
fi
echo "Node.js not found. Install Node or set BATTLE_STANDARD_ELECTRON_NODE." >&2
exit 1
`;
  const shPath = join(resourcesHost, 'run-host.sh');
  writeFileSync(shPath, sh, 'utf8');
  try {
    chmodSync(shPath, 0o755);
  } catch {
    // Windows
  }
}

runHostBuild();
copyBundledHost();
writeLaunchers();
await writeTrayIcon();

mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(trayRoot, 'src', 'main.ts')],
  outfile: join(dist, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
});

console.log('Tray built — resources/host/main.js + dist/main.cjs');
console.log('Run: npm run start --prefix companion/tray');
