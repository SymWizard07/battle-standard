import { referencedAssetIds } from '../lib/campaignAssets';
import { loadAsset, saveAsset, type StoredAsset } from '../lib/db';
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

export function pushAllAssetsReliable(campaign: Campaign | null): void {
  clearAssetRetry();

  const send = () => {
    void pushCampaignAssets(campaign);
  };

  send();
  let attempts = 0;
  assetRetryTimer = setInterval(() => {
    const state = useStore.getState();
    if (state.role !== 'gm' || !state.campaign) {
      clearAssetRetry();
      return;
    }
    void pushCampaignAssets(state.campaign);
    attempts += 1;
    if (attempts >= RELIABLE_MAX_ATTEMPTS) clearAssetRetry();
  }, RELIABLE_RETRY_MS);
}

export function wireGmAssetSync(): () => void {
  const pushAll = () => {
    void pushCampaignAssets(useStore.getState().campaign);
  };

  pushAll();

  const unsub = useStore.subscribe((state, prev) => {
    if (state.role !== 'gm') return;
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
