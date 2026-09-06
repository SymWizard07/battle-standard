import { referencedAssetIds } from '../lib/campaignAssets';
import { loadAsset, saveAsset, type StoredAsset } from '../lib/db';
import { scheduleStableMirror } from '../lib/stableStorage';
import type { Campaign } from '../lib/types';
import { publishAsset, type AssetMetadata } from '../net/trysteroRoom';
import { useStore } from '../store/useStore';

const RELIABLE_RETRY_MS = 400;
const RELIABLE_MAX_ATTEMPTS = 12;

let assetRetryTimer: ReturnType<typeof setInterval> | null = null;
const sentAssetIds = new Set<string>();

async function ensureAssetUrlRegistered(assetId: string, blob: Blob): Promise<void> {
  if (useStore.getState().assetUrls[assetId]) return;
  useStore.getState().registerAssetUrl(assetId, URL.createObjectURL(blob));
}

function isAssetMetadata(value: unknown): value is AssetMetadata {
  if (!value || typeof value !== 'object') return false;
  const meta = value as AssetMetadata;
  return (
    typeof meta.assetId === 'string' &&
    typeof meta.mimeType === 'string' &&
    typeof meta.name === 'string' &&
    typeof meta.createdAt === 'number'
  );
}

export async function handleRemoteAsset(
  data: ArrayBuffer,
  metadata: AssetMetadata,
  campaignId: string,
): Promise<void> {
  if (!isAssetMetadata(metadata)) return;

  const { assetId, mimeType, name, kind, createdAt } = metadata;
  const existing = await loadAsset(assetId);
  if (existing) {
    await ensureAssetUrlRegistered(assetId, existing.blob);
    return;
  }

  const blob = new Blob([data], { type: mimeType });
  await saveAsset({
    id: assetId,
    campaignId,
    blob,
    mimeType,
    name,
    createdAt,
    kind,
  });
  await ensureAssetUrlRegistered(assetId, blob);
  scheduleStableMirror(campaignId);
}

export function clearAssetSyncState(): void {
  if (assetRetryTimer) {
    clearInterval(assetRetryTimer);
    assetRetryTimer = null;
  }
  sentAssetIds.clear();
}

function clearAssetRetry(): void {
  if (assetRetryTimer) {
    clearInterval(assetRetryTimer);
    assetRetryTimer = null;
  }
}

async function pushAsset(asset: StoredAsset): Promise<void> {
  if (sentAssetIds.has(asset.id)) return;
  const buffer = await asset.blob.arrayBuffer();
  publishAsset(buffer, {
    assetId: asset.id,
    mimeType: asset.mimeType,
    name: asset.name,
    kind: asset.kind,
    createdAt: asset.createdAt,
  });
  sentAssetIds.add(asset.id);
}

async function pushCampaignAssets(campaign: Campaign | null): Promise<void> {
  if (!campaign) return;
  for (const assetId of referencedAssetIds(campaign)) {
    const asset = await loadAsset(assetId);
    if (asset) await pushAsset(asset);
  }
}

/** Broadcast all local campaign assets (clears send cache so new peers get files). */
export function pushAllAssetsReliable(campaign: Campaign | null): void {
  clearAssetRetry();
  sentAssetIds.clear();

  const send = () => {
    void pushCampaignAssets(campaign ?? useStore.getState().campaign);
  };

  send();
  let attempts = 0;
  assetRetryTimer = setInterval(() => {
    const state = useStore.getState();
    if (!state.role || !state.campaign) {
      clearAssetRetry();
      return;
    }
    // Re-send so peers that joined mid-transfer still receive blobs.
    sentAssetIds.clear();
    void pushCampaignAssets(state.campaign);
    attempts += 1;
    if (attempts >= RELIABLE_MAX_ATTEMPTS) clearAssetRetry();
  }, RELIABLE_RETRY_MS);
}

/**
 * Push local blobs for any assets referenced by the campaign.
 * Runs for GM and players so peer uploads (paste/library) reach the table.
 */
export function wireAssetSync(): () => void {
  const pushAll = () => {
    void pushCampaignAssets(useStore.getState().campaign);
  };

  pushAll();

  const unsub = useStore.subscribe((state, prev) => {
    if (!state.role) return;
    if (state.campaign !== prev.campaign) pushAll();
  });

  return () => {
    unsub();
  };
}

export async function hydrateAssetsForCampaign(
  campaign: Campaign | null,
): Promise<void> {
  const wanted = referencedAssetIds(campaign);
  for (const assetId of wanted) {
    const existing = await loadAsset(assetId);
    if (existing) await ensureAssetUrlRegistered(assetId, existing.blob);
  }
}
