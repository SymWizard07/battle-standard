#!/usr/bin/env tsx
/**
 * Cross-platform native host registration CLI.
 *
 * Examples:
 *   tsx companion/install/register-cli.ts --extension-id YOUR_ID
 *   tsx companion/install/register-cli.ts --extension-id YOUR_ID --platform firefox --firefox-id uuid@temporary-addon
 *   tsx companion/install/register-cli.ts --dry-run --extension-id abc --launcher C:\path\run-host.cmd
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildChromiumManifest,
  buildFirefoxManifest,
  deployHostBundle,
  getAppSupportDir,
  getDefaultTrayLauncherPath,
  getDevHostLauncherPath,
  getManifestOutputPath,
  registryTargets,
  validateManifest,
  type RegisterPlatform,
} from './lib.js';

function parseArgs(argv: string[]) {
  let extensionId = '';
  let firefoxId = '';
  let launcher = '';
  let platform: RegisterPlatform | 'auto' = 'auto';
  let dryRun = false;
  let useDevLauncher = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--extension-id':
        extensionId = next ?? '';
        i++;
        break;
      case '--firefox-id':
        firefoxId = next ?? '';
        i++;
        break;
      case '--launcher':
        launcher = next ?? '';
        i++;
        break;
      case '--platform':
        platform = (next as RegisterPlatform) ?? 'auto';
        i++;
        break;
      case '--dev-launcher':
        useDevLauncher = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      default:
        break;
    }
  }

  return { extensionId, firefoxId, launcher, platform, dryRun, useDevLauncher };
}

function detectPlatform(): RegisterPlatform {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

async function registerRegistry(manifestPath: string, regPaths: string[]): Promise<string[]> {
  const resolved = path.resolve(manifestPath);
  const messages: string[] = [];
  for (const regPath of regPaths) {
    if (process.env.COMPANION_INSTALL_DRY_RUN === '1') {
      messages.push(`[dry-run] would register ${regPath} -> ${resolved}`);
      continue;
    }
    const result = spawnSync(
      'reg',
      ['add', regPath, '/ve', '/t', 'REG_SZ', '/d', resolved, '/f'],
      { encoding: 'utf8', windowsHide: true },
    );
    messages.push(
      result.status === 0
        ? `Registered ${regPath}`
        : `Failed ${regPath}: ${result.stderr || result.stdout}`,
    );
  }
  return messages;
}

async function copyManifestToDirs(manifestPath: string, platform: RegisterPlatform): Promise<string[]> {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const messages: string[] = [];
  for (const target of registryTargets(platform)) {
    if (process.env.COMPANION_INSTALL_DRY_RUN === '1') {
      messages.push(`[dry-run] would write ${target}`);
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, raw, 'utf8');
    messages.push(`Wrote ${target}`);
  }
  return messages;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const platform = args.platform === 'auto' ? detectPlatform() : args.platform;

  if (!args.extensionId && platform !== 'firefox') {
    console.error('Usage: register-cli.ts --extension-id YOUR_CHROME_EXTENSION_ID [--launcher PATH] [--dry-run]');
    process.exit(1);
  }

  let launcherPath: string;
  if (args.launcher) {
    launcherPath = path.resolve(args.launcher);
    try {
      await fs.access(launcherPath);
    } catch {
      console.error(`Launcher not found: ${launcherPath}`);
      process.exit(1);
    }
  } else {
    const sourceLauncher = args.useDevLauncher
      ? getDevHostLauncherPath()
      : getDefaultTrayLauncherPath();
    try {
      await fs.access(sourceLauncher);
    } catch {
      console.error(`Launcher not found: ${sourceLauncher}`);
      console.error('Run: npm run companion:tray:build  (or use --dev-launcher after companion:host:build)');
      process.exit(1);
    }
    launcherPath = await deployHostBundle(path.dirname(sourceLauncher));
    console.log('Deployed host to:', path.dirname(launcherPath));
  }

  const isFirefox = platform === 'firefox';
  const firefoxExtensionId = args.firefoxId || args.extensionId;
  if (isFirefox && !firefoxExtensionId) {
    console.error('Firefox requires --firefox-id (e.g. uuid@temporary-addon from about:debugging)');
    process.exit(1);
  }

  const manifest = isFirefox
    ? buildFirefoxManifest(launcherPath, firefoxExtensionId)
    : buildChromiumManifest(launcherPath, args.extensionId);

  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    console.error('Invalid manifest:', errors.join('; '));
    process.exit(1);
  }

  const manifestPath = getManifestOutputPath();
  const targets = registryTargets(platform);

  if (args.dryRun) {
    process.env.COMPANION_INSTALL_DRY_RUN = '1';
    console.log('[dry-run] manifest path:', manifestPath);
    console.log(JSON.stringify(manifest, null, 2));
    console.log('[dry-run] registration targets:');
    for (const t of targets) console.log(`  ${t}`);
  } else {
    await fs.mkdir(getAppSupportDir(), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log('Wrote manifest:', manifestPath);
  }

  let messages: string[] = [];
  if (platform === 'windows') {
    messages = await registerRegistry(manifestPath, registryTargets('windows'));
  } else if (platform === 'macos' || platform === 'linux') {
    messages = await copyManifestToDirs(manifestPath, platform);
  } else if (platform === 'firefox') {
    if (process.platform === 'win32') {
      // Firefox on Windows reads the manifest path from the registry (not a JSON file in AppData\Mozilla).
      messages = await registerRegistry(manifestPath, registryTargets('firefox'));
    } else {
      messages = await copyManifestToDirs(manifestPath, 'firefox');
    }
  }

  for (const line of messages) console.log(line);

  if (args.dryRun) {
    console.log('[dry-run] complete — manifest validated, no files or registry updated');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
