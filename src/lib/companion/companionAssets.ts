import type { CompanionAssetPayload } from '@companion/protocol';
import type { StoredAsset } from '../db';

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToBlob(dataBase64: string, mimeType: string): Blob {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function storedAssetToCompanionPayload(
  asset: StoredAsset,
): Promise<CompanionAssetPayload> {
  return {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    kind: asset.kind,
    createdAt: asset.createdAt,
    dataBase64: await blobToBase64(asset.blob),
  };
}

export function companionAssetToStored(
  asset: CompanionAssetPayload,
  campaignId: string,
): StoredAsset {
  return {
    id: asset.id,
    campaignId,
    blob: base64ToBlob(asset.dataBase64, asset.mimeType),
    mimeType: asset.mimeType,
    name: asset.name,
    createdAt: asset.createdAt,
    ...(asset.kind != null ? { kind: asset.kind } : {}),
  };
}

export function companionAssetsToStored(
  assets: CompanionAssetPayload[],
  campaignId: string,
): StoredAsset[] {
  return assets.map((asset) => companionAssetToStored(asset, campaignId));
}

/** @deprecated Use storedAssetToCompanionPayload */
export async function blobToCompanionAsset(asset: StoredAsset): Promise<CompanionAssetPayload> {
  return storedAssetToCompanionPayload(asset);
}
