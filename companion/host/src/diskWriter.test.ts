/**
 * Automated — host diskWriter read/write/delete/lock tests.
 * Run: npm run test:companion-disk
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Campaign, TokenLibraryLayout } from '../../../src/lib/types.js';
import type { CompanionAssetPayload } from '../../protocol/messages.js';
import {
  ASSETS_DIR,
  ASSETS_MANIFEST,
  CAMPAIGN_JSON,
  CAMPAIGNS_DIR,
  LOCK_FILE,
  ROOT_MANIFEST_FILE,
} from '../../shared/diskLayout.js';
import { campaignFolderName } from '../../shared/campaignDirName.js';
import {
  deleteCampaignFromDisk,
  isDiskEmpty,
  listCampaignIds,
  readCampaignFromDisk,
  readGlobalFromDisk,
  writeCampaignToDisk,
  writeCampaignToDiskForTest,
  writeGlobalToDisk,
} from './diskWriter.js';

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function samplePngBase64(): string {
  // 1x1 PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ).toString('base64');
}

function sampleCampaign(id = 'camp-test-1'): Campaign {
  const sceneId = 'scene-1';
  const mapAssetId = 'asset-map-1';
  const tokenAssetId = 'asset-token-1';
  return {
    id,
    name: 'Test Campaign',
    sceneDeck: [{ type: 'scene', sceneId }],
    scenes: {
      [sceneId]: {
        id: sceneId,
        name: 'Scene 1',
        maps: [
          {
            id: 'map-layer-1',
            assetId: mapAssetId,
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            imageWidth: 800,
            imageHeight: 600,
          },
        ],
        tokens: [
          {
            id: 'token-1',
            name: 'Hero',
            imageAssetId: tokenAssetId,
            gridPos: { col: 2, row: 3 },
            footprint: { w: 1, h: 1 },
            rotation: 0,
            statusEffects: [],
            owner: 'gm',
            color: '#ff0000',
          },
        ],
        fog: { defaultHidden: false, ops: [] },
        measurements: [],
        drawStrokes: [],
      },
    },
    lastActiveSceneId: sceneId,
    createdAt: 1000,
    updatedAt: 2000,
  };
}

function sampleAssets(): CompanionAssetPayload[] {
  const png = samplePngBase64();
  return [
    {
      id: 'asset-map-1',
      name: 'Map.png',
      mimeType: 'image/png',
      kind: 'map',
      createdAt: 1000,
      dataBase64: png,
    },
    {
      id: 'asset-token-1',
      name: 'Hero.png',
      mimeType: 'image/png',
      kind: 'token',
      createdAt: 1001,
      dataBase64: png,
    },
    {
      id: 'asset-unused',
      name: 'Unused.png',
      mimeType: 'image/png',
      kind: 'token',
      createdAt: 1002,
      dataBase64: png,
    },
  ];
}

async function withTempSaveRoot<T>(fn: (saveFolder: string) => Promise<T>): Promise<T> {
  const saveFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'bm-save-'));
  try {
    return await fn(saveFolder);
  } finally {
    await fs.rm(saveFolder, { recursive: true, force: true });
  }
}

async function testIsDiskEmpty() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    assertEqual(await isDiskEmpty(config), true);
    await writeCampaignToDisk(config, { campaign: sampleCampaign(), assets: sampleAssets() });
    assertEqual(await isDiskEmpty(config), false);
  });
}

async function testWriteReadCampaignRoundTrip() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    const campaign = sampleCampaign();
    const assets = sampleAssets();
    await writeCampaignToDisk(config, { campaign, assets });

    const read = await readCampaignFromDisk(config, campaign.id);
    if (!read) throw new Error('Expected campaign on disk');
    if (!deepEqual(read.campaign, campaign)) {
      throw new Error('Campaign JSON mismatch after round-trip');
    }
    assertEqual(read.assets.length, 2, 'Should persist only referenced assets');
    const ids = new Set(read.assets.map((a) => a.id));
    assertEqual(ids.has('asset-map-1'), true);
    assertEqual(ids.has('asset-token-1'), true);
    assertEqual(ids.has('asset-unused'), false);

    const manifestPath = path.join(
      saveFolder,
      CAMPAIGNS_DIR,
      campaignFolderName(campaign),
      ASSETS_DIR,
      ASSETS_MANIFEST,
    );
    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    if (manifestRaw.includes('asset-unused')) {
      throw new Error('Unused asset should not appear in manifest');
    }
  });
}

async function testWriteReadGlobal() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    const tokenLibrary: TokenLibraryLayout = {
      groups: [{ id: 'g1', name: 'Party', kind: 'user', collapsed: false, order: 0 }],
      entries: [],
    };
    const assets = sampleAssets().slice(0, 1);
    await writeGlobalToDisk(config, { tokenLibrary, assets });

    const read = await readGlobalFromDisk(config);
    if (!deepEqual(read.tokenLibrary, tokenLibrary)) {
      throw new Error('Token library mismatch');
    }
    assertEqual(read.assets.length, 1);
  });
}

async function testReadGlobalMissingDir() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    const read = await readGlobalFromDisk(config);
    if (read.tokenLibrary !== null) throw new Error('Expected null token library');
    assertEqual(read.assets.length, 0);
  });
}

async function testDeleteCampaign() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    const campaign = sampleCampaign();
    await writeCampaignToDisk(config, { campaign, assets: sampleAssets() });
    assertEqual((await listCampaignIds(config)).includes(campaign.id), true);

    await deleteCampaignFromDisk(config, campaign.id);
    assertEqual(await readCampaignFromDisk(config, campaign.id), null);
    assertEqual((await listCampaignIds(config)).includes(campaign.id), false);

    const campaignDir = path.join(saveFolder, CAMPAIGNS_DIR, campaignFolderName(campaign));
    try {
      await fs.access(campaignDir);
      throw new Error('Campaign folder should be removed');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  });
}

async function testListCampaignIds() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    await writeCampaignToDisk(config, { campaign: sampleCampaign('a'), assets: [] });
    await writeCampaignToDisk(config, { campaign: sampleCampaign('b'), assets: [] });
    const ids = await listCampaignIds(config);
    assertEqual(ids.sort().join(','), 'a,b');
  });
}

async function testLockBlocksConcurrentWrite() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    const lockPath = path.join(saveFolder, LOCK_FILE);
    await fs.mkdir(saveFolder, { recursive: true });
    await fs.writeFile(lockPath, '{"pid":1}', 'utf8');

    let threw = false;
    try {
      await writeCampaignToDisk(config, { campaign: sampleCampaign(), assets: [] });
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : '';
      if (!message.includes('locked')) {
        throw new Error(`Expected lock error, got: ${message}`);
      }
    }
    assertEqual(threw, true);
  });
}

async function testFailedWriteRollsBack() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    const campaignV1 = sampleCampaign();
    campaignV1.name = 'Version 1';
    await writeCampaignToDisk(config, { campaign: campaignV1, assets: sampleAssets() });

    const campaignV2 = sampleCampaign();
    campaignV2.name = 'Version 2';
    let failed = false;
    try {
      await writeCampaignToDiskForTest(
        config,
        { campaign: campaignV2, assets: sampleAssets() },
        { failAfterStaging: true },
      );
    } catch {
      failed = true;
    }
    assertEqual(failed, true);

    const read = await readCampaignFromDisk(config, campaignV1.id);
    if (!read) throw new Error('Original campaign missing after failed write');
    assertEqual(read.campaign.name, 'Version 1');

    const lockPath = path.join(saveFolder, LOCK_FILE);
    try {
      await fs.access(lockPath);
      throw new Error('Lock file should be released after failed write');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    const campaignsDir = path.join(saveFolder, CAMPAIGNS_DIR);
    const entries = await fs.readdir(campaignsDir);
    for (const name of entries) {
      if (name.startsWith('.staging-')) {
        throw new Error(`Staging dir should be cleaned up: ${name}`);
      }
    }
  });
}

async function testRootManifestUpdated() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    const campaign = sampleCampaign();
    await writeCampaignToDisk(config, { campaign, assets: [] });
    const manifestPath = path.join(saveFolder, ROOT_MANIFEST_FILE);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
      campaigns: string[];
    };
    assertEqual(manifest.campaigns.includes(campaign.id), true);
  });
}

async function testOnDiskLayoutPaths() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    const campaign = sampleCampaign();
    await writeCampaignToDisk(config, { campaign, assets: sampleAssets() });

    const campaignJson = path.join(saveFolder, CAMPAIGNS_DIR, campaignFolderName(campaign), CAMPAIGN_JSON);
    await fs.access(campaignJson);
    const assetsManifest = path.join(
      saveFolder,
      CAMPAIGNS_DIR,
      campaignFolderName(campaign),
      ASSETS_DIR,
      ASSETS_MANIFEST,
    );
    await fs.access(assetsManifest);
  });
}

async function testRenameFolderWhenCampaignNameChanges() {
  await withTempSaveRoot(async (saveFolder) => {
    const config = { saveFolder };
    const campaign = sampleCampaign();
    campaign.name = 'First Name';
    await writeCampaignToDisk(config, { campaign, assets: [] });

    const firstDir = path.join(saveFolder, CAMPAIGNS_DIR, campaignFolderName(campaign));
    await fs.access(firstDir);

    campaign.name = 'Renamed Campaign';
    campaign.updatedAt = 3000;
    await writeCampaignToDisk(config, { campaign, assets: [] });

    const renamedDir = path.join(saveFolder, CAMPAIGNS_DIR, campaignFolderName(campaign));
    await fs.access(renamedDir);
    try {
      await fs.access(firstDir);
      throw new Error('Old campaign folder should be removed after rename');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    const read = await readCampaignFromDisk(config, campaign.id);
    assertEqual(read?.campaign.name, 'Renamed Campaign');
  });
}

async function runTests() {
  await testIsDiskEmpty();
  await testWriteReadCampaignRoundTrip();
  await testWriteReadGlobal();
  await testReadGlobalMissingDir();
  await testDeleteCampaign();
  await testListCampaignIds();
  await testLockBlocksConcurrentWrite();
  await testFailedWriteRollsBack();
  await testRootManifestUpdated();
  await testOnDiskLayoutPaths();
  await testRenameFolderWhenCampaignNameChanges();
  console.log('[automated] companion/host diskWriter tests passed');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
