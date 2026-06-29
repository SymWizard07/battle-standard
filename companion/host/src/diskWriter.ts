import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Campaign, TokenLibraryLayout } from '../../../src/lib/types.js';
import type { CompanionAssetPayload } from '../../protocol/messages.js';
import { manifestEntryFromPayload } from '../../shared/assetFileName.js';
import {
  campaignFolderName,
  folderNameMatchesCampaignId,
} from '../../shared/campaignDirName.js';
import type { CompanionConfig } from '../../shared/config.js';
import {
  ASSETS_DIR,
  ASSETS_MANIFEST,
  CAMPAIGN_JSON,
  CAMPAIGNS_DIR,
  GLOBAL_DIR,
  LOCK_FILE,
  ROOT_MANIFEST_FILE,
  STORAGE_SCHEMA_VERSION,
  TOKEN_LIBRARY_JSON,
  type AssetManifest,
  type RootManifest,
} from '../../shared/diskLayout.js';
import { referencedAssetIds } from '../../shared/referencedAssets.js';

export type HostConfig = CompanionConfig;

export interface WriteCampaignInput {
  campaign: Campaign;
  assets: CompanionAssetPayload[];
}

export interface WriteGlobalInput {
  tokenLibrary: TokenLibraryLayout | null;
  assets: CompanionAssetPayload[];
}

export interface ReadCampaignResult {
  campaign: Campaign;
  assets: CompanionAssetPayload[];
}

export interface ReadGlobalResult {
  tokenLibrary: TokenLibraryLayout | null;
  assets: CompanionAssetPayload[];
}

function requireSaveFolder(config: HostConfig): string {
  if (!config.saveFolder) {
    throw new Error('Save folder not configured in host.');
  }
  return config.saveFolder;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${randomUUID()}`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

function decodeBase64(data: string): Buffer {
  return Buffer.from(data, 'base64');
}

function encodeBase64(data: Buffer): string {
  return data.toString('base64');
}

async function acquireLock(root: string): Promise<void> {
  const lockPath = path.join(root, LOCK_FILE);
  try {
    await fs.writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, at: Date.now() }),
      { flag: 'wx' },
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Save folder is locked by another write.');
    }
    throw err;
  }
}

async function releaseLock(root: string): Promise<void> {
  await fs.unlink(path.join(root, LOCK_FILE)).catch(() => {});
}

async function removeDirIfExists(target: string): Promise<void> {
  if (await pathExists(target)) {
    await fs.rm(target, { recursive: true, force: true });
  }
}

function isCampaignDirName(name: string): boolean {
  return !name.startsWith('.') && name !== LOCK_FILE;
}

async function listCampaignDirNames(campaignsDir: string): Promise<string[]> {
  if (!(await pathExists(campaignsDir))) return [];
  const entries = await fs.readdir(campaignsDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && isCampaignDirName(e.name)).map((e) => e.name);
}

async function findCampaignFolderName(
  campaignsDir: string,
  campaignId: string,
): Promise<string | null> {
  const names = await listCampaignDirNames(campaignsDir);
  for (const name of names) {
    if (folderNameMatchesCampaignId(name, campaignId)) return name;
  }
  return null;
}

async function readCampaignIdInFolder(campaignsDir: string, folderName: string): Promise<string | null> {
  const campaign = await readJsonFile<Campaign>(path.join(campaignsDir, folderName, CAMPAIGN_JSON));
  return campaign?.id ?? null;
}

async function readAssetsFromDir(
  assetsDir: string,
): Promise<{ manifest: AssetManifest; files: Map<string, Buffer> }> {
  const manifest =
    (await readJsonFile<AssetManifest>(path.join(assetsDir, ASSETS_MANIFEST))) ?? { assets: [] };
  const files = new Map<string, Buffer>();
  for (const entry of manifest.assets) {
    const filePath = path.join(assetsDir, entry.file);
    try {
      files.set(entry.id, await fs.readFile(filePath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  return { manifest, files };
}

function assetsToPayload(
  manifest: AssetManifest,
  files: Map<string, Buffer>,
): CompanionAssetPayload[] {
  const out: CompanionAssetPayload[] = [];
  for (const entry of manifest.assets) {
    const buf = files.get(entry.id);
    if (!buf) continue;
    out.push({
      id: entry.id,
      name: entry.name,
      mimeType: entry.mimeType,
      kind: entry.kind,
      createdAt: entry.createdAt,
      dataBase64: encodeBase64(buf),
    });
  }
  return out;
}

async function writeAssetsToDir(
  assetsDir: string,
  assets: CompanionAssetPayload[],
): Promise<void> {
  await fs.mkdir(assetsDir, { recursive: true });
  const manifest: AssetManifest = {
    assets: assets.map((a) => manifestEntryFromPayload(a)),
  };
  await writeJsonAtomic(path.join(assetsDir, ASSETS_MANIFEST), manifest);
  for (const asset of assets) {
    const entry = manifest.assets.find((e) => e.id === asset.id);
    if (!entry) continue;
    await fs.writeFile(path.join(assetsDir, entry.file), decodeBase64(asset.dataBase64));
  }
}

async function writeRootManifest(root: string): Promise<void> {
  const campaignsDir = path.join(root, CAMPAIGNS_DIR);
  const folderNames = await listCampaignDirNames(campaignsDir);
  const campaignIds: string[] = [];
  for (const folder of folderNames) {
    const id = await readCampaignIdInFolder(campaignsDir, folder);
    if (id) campaignIds.push(id);
  }
  const manifest: RootManifest = {
    version: STORAGE_SCHEMA_VERSION,
    campaigns: campaignIds,
    lastSyncedAt: Date.now(),
  };
  await writeJsonAtomic(path.join(root, ROOT_MANIFEST_FILE), manifest);
}

async function commitStagingDir(stagingDir: string, targetDir: string): Promise<void> {
  await removeDirIfExists(targetDir);
  await fs.rename(stagingDir, targetDir);
}

export async function writeCampaignToDisk(
  config: HostConfig,
  input: WriteCampaignInput,
): Promise<string> {
  const root = requireSaveFolder(config);
  await fs.mkdir(root, { recursive: true });
  await acquireLock(root);

  const campaignsDir = path.join(root, CAMPAIGNS_DIR);
  const campaignId = input.campaign.id;
  const folderName = campaignFolderName(input.campaign);
  const campaignDir = path.join(campaignsDir, folderName);
  const previousFolder = await findCampaignFolderName(campaignsDir, campaignId);
  const stagingDir = path.join(campaignsDir, `.staging-${campaignId}-${randomUUID()}`);

  try {
    await fs.mkdir(stagingDir, { recursive: true });
    await writeJsonAtomic(path.join(stagingDir, CAMPAIGN_JSON), input.campaign);

    const assetIds = referencedAssetIds(input.campaign);
    const relevant = input.assets.filter((a) => assetIds.has(a.id));
    await writeAssetsToDir(path.join(stagingDir, ASSETS_DIR), relevant);

    await commitStagingDir(stagingDir, campaignDir);
    if (previousFolder && previousFolder !== folderName) {
      await removeDirIfExists(path.join(campaignsDir, previousFolder));
    }
    await writeRootManifest(root);
    return campaignDir;
  } catch (err) {
    await removeDirIfExists(stagingDir);
    throw err;
  } finally {
    await releaseLock(root);
  }
}

export async function writeGlobalToDisk(
  config: HostConfig,
  input: WriteGlobalInput,
): Promise<string> {
  const root = requireSaveFolder(config);
  await fs.mkdir(root, { recursive: true });
  await acquireLock(root);

  const globalDir = path.join(root, GLOBAL_DIR);
  const stagingDir = path.join(root, `.staging-global-${randomUUID()}`);

  try {
    await fs.mkdir(stagingDir, { recursive: true });
    if (input.tokenLibrary) {
      await writeJsonAtomic(path.join(stagingDir, TOKEN_LIBRARY_JSON), input.tokenLibrary);
    }
    await writeAssetsToDir(path.join(stagingDir, ASSETS_DIR), input.assets);

    await commitStagingDir(stagingDir, globalDir);
    return globalDir;
  } catch (err) {
    await removeDirIfExists(stagingDir);
    throw err;
  } finally {
    await releaseLock(root);
  }
}

export async function readCampaignFromDisk(
  config: HostConfig,
  campaignId: string,
): Promise<ReadCampaignResult | null> {
  const root = requireSaveFolder(config);
  const campaignsDir = path.join(root, CAMPAIGNS_DIR);
  const folderName = await findCampaignFolderName(campaignsDir, campaignId);
  if (!folderName) return null;

  const campaignDir = path.join(campaignsDir, folderName);
  const campaign = await readJsonFile<Campaign>(path.join(campaignDir, CAMPAIGN_JSON));
  if (!campaign) return null;

  const assetsDir = path.join(campaignDir, ASSETS_DIR);
  if (!(await pathExists(assetsDir))) {
    return { campaign, assets: [] };
  }

  const { manifest, files } = await readAssetsFromDir(assetsDir);
  return { campaign, assets: assetsToPayload(manifest, files) };
}

export async function readGlobalFromDisk(config: HostConfig): Promise<ReadGlobalResult> {
  const root = requireSaveFolder(config);
  const globalDir = path.join(root, GLOBAL_DIR);
  if (!(await pathExists(globalDir))) {
    return { tokenLibrary: null, assets: [] };
  }

  const tokenLibrary = await readJsonFile<TokenLibraryLayout>(
    path.join(globalDir, TOKEN_LIBRARY_JSON),
  );
  const assetsDir = path.join(globalDir, ASSETS_DIR);
  if (!(await pathExists(assetsDir))) {
    return { tokenLibrary, assets: [] };
  }

  const { manifest, files } = await readAssetsFromDir(assetsDir);
  return { tokenLibrary, assets: assetsToPayload(manifest, files) };
}

export async function deleteCampaignFromDisk(
  config: HostConfig,
  campaignId: string,
): Promise<void> {
  const root = requireSaveFolder(config);
  await acquireLock(root);
  try {
    const campaignsDir = path.join(root, CAMPAIGNS_DIR);
    const folderName = await findCampaignFolderName(campaignsDir, campaignId);
    if (folderName) {
      await removeDirIfExists(path.join(campaignsDir, folderName));
    }
    await writeRootManifest(root);
  } finally {
    await releaseLock(root);
  }
}

export async function listCampaignIds(config: HostConfig): Promise<string[]> {
  const root = requireSaveFolder(config);
  const campaignsDir = path.join(root, CAMPAIGNS_DIR);
  const folderNames = await listCampaignDirNames(campaignsDir);
  const ids: string[] = [];
  for (const folder of folderNames) {
    const id = await readCampaignIdInFolder(campaignsDir, folder);
    if (id) ids.push(id);
  }
  return ids;
}

export async function isDiskEmpty(config: HostConfig): Promise<boolean> {
  const root = config.saveFolder;
  if (!root || !(await pathExists(root))) return true;

  const manifest = await readJsonFile<RootManifest>(path.join(root, ROOT_MANIFEST_FILE));
  if (manifest && manifest.campaigns.length > 0) return false;

  const campaignIds = await listCampaignDirNames(path.join(root, CAMPAIGNS_DIR));
  if (campaignIds.length > 0) return false;

  const globalDir = path.join(root, GLOBAL_DIR);
  if (await pathExists(globalDir)) {
    const assetsDir = path.join(globalDir, ASSETS_DIR);
    if (await pathExists(assetsDir)) {
      const assetManifest = await readJsonFile<AssetManifest>(
        path.join(assetsDir, ASSETS_MANIFEST),
      );
      if (assetManifest && assetManifest.assets.length > 0) return false;
    }
    const layout = await readJsonFile(path.join(globalDir, TOKEN_LIBRARY_JSON));
    if (layout) return false;
  }

  return true;
}

/** @internal Test hook — simulate failure after staging write. */
export async function writeCampaignToDiskForTest(
  config: HostConfig,
  input: WriteCampaignInput,
  options: { failAfterStaging?: boolean },
): Promise<string> {
  if (!options.failAfterStaging) {
    return writeCampaignToDisk(config, input);
  }

  const root = requireSaveFolder(config);
  await fs.mkdir(root, { recursive: true });
  await acquireLock(root);

  const campaignsDir = path.join(root, CAMPAIGNS_DIR);
  const campaignId = input.campaign.id;
  const stagingDir = path.join(campaignsDir, `.staging-${campaignId}-${randomUUID()}`);

  try {
    await fs.mkdir(stagingDir, { recursive: true });
    await writeJsonAtomic(path.join(stagingDir, CAMPAIGN_JSON), input.campaign);
    throw new Error('Simulated commit failure');
  } catch (err) {
    await removeDirIfExists(stagingDir);
    throw err;
  } finally {
    await releaseLock(root);
  }
}
