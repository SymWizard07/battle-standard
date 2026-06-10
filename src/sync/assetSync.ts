import * as Y from 'yjs';
import { referencedAssetIds } from '../lib/campaignAssets';
import { loadAsset, saveAsset, type StoredAsset } from '../lib/db';
import type { Campaign, SessionRole } from '../lib/types';
import { useStore } from '../store/useStore';

type SyncedAssetRecord = {
  mimeType: string;
  name: string;
  kind?: StoredAsset['kind'];
  createdAt: number;
  dataB64: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isSyncedAssetRecord(value: unknown): value is SyncedAssetRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as SyncedAssetRecord;
  return (
    typeof record.mimeType === 'string' &&
    typeof record.name === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.dataB64 === 'string'
  );
}

async function ensureAssetUrlRegistered(assetId: string, blob: Blob): Promise<void> {
  if (useStore.getState().assetUrls[assetId]) return;
  useStore.getState().registerAssetUrl(assetId, URL.createObjectURL(blob));
}

async function importSyncedAsset(
  assetId: string,
  record: SyncedAssetRecord,
  campaignId: string,
): Promise<void> {
  const existing = await loadAsset(assetId);
  if (existing) {
    await ensureAssetUrlRegistered(assetId, existing.blob);
    return;
  }
  const bytes = base64ToBytes(record.dataB64);
  const blob = new Blob([Uint8Array.from(bytes)], { type: record.mimeType });
  await saveAsset({
    id: assetId,
    campaignId,
    blob,
    mimeType: record.mimeType,
    name: record.name,
    createdAt: record.createdAt,
    kind: record.kind,
  });
  await ensureAssetUrlRegistered(assetId, blob);
}

async function pushAssetIfMissing(
  assetMap: Y.Map<unknown>,
  asset: StoredAsset,
): Promise<void> {
  if (assetMap.has(asset.id)) return;
  const buffer = await asset.blob.arrayBuffer();
  const payload: SyncedAssetRecord = {
    mimeType: asset.mimeType,
    name: asset.name,
    kind: asset.kind,
    createdAt: asset.createdAt,
    dataB64: bytesToBase64(new Uint8Array(buffer)),
  };
  assetMap.set(asset.id, payload);
}

async function pushCampaignAssets(
  assetMap: Y.Map<unknown>,
  campaign: Campaign | null,
): Promise<void> {
  if (!campaign) return;
  for (const assetId of referencedAssetIds(campaign)) {
    const asset = await loadAsset(assetId);
    if (asset) await pushAssetIfMissing(assetMap, asset);
  }
}

async function hydrateAssetsFromMap(
  assetMap: Y.Map<unknown>,
  campaignId: string,
  campaign: Campaign | null,
): Promise<void> {
  const wanted = referencedAssetIds(campaign);
  for (const assetId of wanted) {
    const raw = assetMap.get(assetId);
    if (!isSyncedAssetRecord(raw)) continue;
    await importSyncedAsset(assetId, raw, campaignId);
  }
}

export function wireAssetSync(
  doc: Y.Doc,
  role: SessionRole,
  campaignId: string,
): () => void {
  const assetMap = doc.getMap('assets');

  if (role === 'player') {
    let syncing = false;
    const syncAll = () => {
      if (syncing) return;
      syncing = true;
      void hydrateAssetsFromMap(
        assetMap,
        campaignId,
        useStore.getState().campaign,
      ).finally(() => {
        syncing = false;
      });
    };

    assetMap.observe(syncAll);
    syncAll();

    const unsubCampaign = useStore.subscribe((state, prev) => {
      if (state.campaign !== prev.campaign) syncAll();
    });

    return () => {
      assetMap.unobserve(syncAll);
      unsubCampaign();
    };
  }

  const pushAll = () => {
    void pushCampaignAssets(assetMap, useStore.getState().campaign);
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
