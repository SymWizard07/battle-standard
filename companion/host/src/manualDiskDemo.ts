#!/usr/bin/env node
/**
 * Manual gate — writes a sample campaign via diskWriter and prints paths to inspect.
 * Also prints a native-messaging JSON sample for piping to `npm run companion:host`.
 *
 * Run: npm run companion:disk:manual
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { encodeNativeMessage } from '../../protocol/nativeMessaging.js';
import { encodeSaveCampaignSession } from '../../protocol/session.js';
import type { Campaign } from '../../../src/lib/types.js';
import {
  ASSETS_DIR,
  ASSETS_MANIFEST,
  CAMPAIGN_JSON,
  CAMPAIGNS_DIR,
  ROOT_MANIFEST_FILE,
} from '../../shared/diskLayout.js';
import { saveConfig } from '../../shared/config.js';
import { getConfigFilePath } from '../../shared/configPaths.js';
import { handleHostMessages } from './handlers.js';
import { readCampaignFromDisk, writeCampaignToDisk } from './diskWriter.js';

const PNG_BASE64 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
).toString('base64');

function sampleCampaign(): Campaign {
  const sceneId = 'scene-demo';
  return {
    id: 'manual-demo-campaign',
    name: 'Manual Demo Campaign',
    sceneDeck: [{ type: 'scene', sceneId }],
    scenes: {
      [sceneId]: {
        id: sceneId,
        name: 'Demo Scene',
        maps: [
          {
            id: 'map-1',
            assetId: 'demo-map-asset',
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            imageWidth: 800,
            imageHeight: 600,
          },
        ],
        tokens: [],
        fog: { unexploredMask: [], revealedMask: [], defaultHidden: false },
        measurements: [],
        drawStrokes: [],
      },
    },
    lastActiveSceneId: sceneId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function printTree(dir: string, prefix = ''): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const isLast = i === entries.length - 1;
    const branch = isLast ? '└── ' : '├── ';
    console.log(`${prefix}${branch}${entry.name}`);
    if (entry.isDirectory()) {
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      await printTree(path.join(dir, entry.name), nextPrefix);
    }
  }
}

async function main() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'bm-manual-home-'));
  const saveFolder = path.join(home, 'BattleMapSave');
  await fs.mkdir(saveFolder, { recursive: true });

  const configOverrides = { home, platform: 'linux' as const };
  await saveConfig({ saveFolder }, configOverrides);
  const configPath = getConfigFilePath(configOverrides);
  process.env.BM_COMPANION_CONFIG_FILE = configPath;

  console.log('');
  console.log('=== Stage 1 manual disk demo ===');
  console.log('');
  console.log('[1] Config written (simulated app-data):');
  console.log(`    ${configPath}`);
  console.log(`    saveFolder → ${saveFolder}`);
  console.log('');

  process.env.HOME = home;
  if (process.platform === 'win32') {
    process.env.APPDATA = path.join(home, 'AppData', 'Roaming');
    await fs.mkdir(process.env.APPDATA, { recursive: true });
  }

  const campaign = sampleCampaign();
  const assets = [
    {
      id: 'demo-map-asset',
      name: 'DemoMap.png',
      mimeType: 'image/png',
      kind: 'map' as const,
      createdAt: Date.now(),
      dataBase64: PNG_BASE64,
    },
  ];

  const config = { saveFolder };
  const writtenPath = await writeCampaignToDisk(config, { campaign, assets });
  console.log('[2] diskWriter.writeCampaignToDisk completed:');
  console.log(`    ${writtenPath}`);
  console.log('');

  const readBack = await readCampaignFromDisk(config, campaign.id);
  console.log('[3] Read-back check:');
  console.log(`    campaign.name = ${readBack?.campaign.name ?? '(missing)'}`);
  console.log(`    assets on disk = ${readBack?.assets.length ?? 0}`);
  console.log('');

  console.log('[4] Folder tree (verify layout manually):');
  console.log(`    ${saveFolder}/`);
  await printTree(saveFolder);
  console.log('');
  console.log('    Expected paths:');
  console.log(`      ${ROOT_MANIFEST_FILE}`);
  console.log(`      ${CAMPAIGNS_DIR}/${campaign.id}/${CAMPAIGN_JSON}`);
  console.log(`      ${CAMPAIGNS_DIR}/${campaign.id}/${ASSETS_DIR}/${ASSETS_MANIFEST}`);
  console.log(`      ${CAMPAIGNS_DIR}/${campaign.id}/${ASSETS_DIR}/demo-map-asset.png`);
  console.log('');

  const sessionMessages = encodeSaveCampaignSession(campaign, assets, 'manual-demo-session');
  const handlerResults = await handleHostMessages(sessionMessages);
  console.log('[5] handleHostMessages(v2 save session) final response:');
  console.log(`    ${JSON.stringify(handlerResults[handlerResults.length - 1])}`);
  console.log('');

  const pingPayload = encodeNativeMessage({ type: 'ping' });
  console.log('[6] Native host stdin test (optional — pipe length-prefixed JSON):');
  console.log('    In a second terminal: npm run companion:host');
  console.log('    Then run this PowerShell one-liner (sets save folder via env not supported — use demo folder above):');
  console.log('');
  console.log('    Sample message JSON body: {"type":"ping"}');
  console.log(`    Encoded length prefix (hex): ${pingPayload.subarray(0, 4).toString('hex')} + JSON`);
  console.log('');

  if (process.env.BM_RUN_HOST_PING === '1') {
    console.log('[7] Spawning companion:host and sending ping…');
    const host = spawn('npx', ['tsx', 'companion/host/src/main.ts'], {
      cwd: path.resolve(process.cwd()),
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: true,
    });
    host.stdin.write(pingPayload);
    const chunks: Buffer[] = [];
    host.stdout.on('data', (c: Buffer) => chunks.push(c));
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        host.stdin.end();
        resolve();
      }, 500);
    });
    const out = Buffer.concat(chunks);
    console.log(`    Host stdout (${out.length} bytes): ${out.toString('utf8').slice(0, 200)}`);
  } else {
    console.log('[7] Optional host spawn skipped. Set BM_RUN_HOST_PING=1 to auto-ping the host.');
  }

  console.log('');
  console.log('=== Manual checklist ===');
  console.log('  [ ] Tree above matches campaigns/{id}/campaign.json + assets/manifest.json');
  console.log('  [ ] demo-map-asset.png exists and opens as a 1×1 PNG');
  console.log('  [ ] battle-map-storage.json lists manual-demo-campaign');
  console.log(`  [ ] Save folder left at: ${saveFolder}`);
  console.log('      (delete manually when done inspecting)');
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
