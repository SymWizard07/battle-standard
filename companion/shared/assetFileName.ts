import type { AssetManifestEntry } from './diskLayout.js';

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export function extForAsset(meta: { mimeType: string; name: string }): string {
  const fromMime = MIME_EXT[meta.mimeType.toLowerCase()];
  if (fromMime) return fromMime;
  const match = meta.name.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : 'bin';
}

export function assetFileName(id: string, meta: { mimeType: string; name: string }): string {
  return `${id}.${extForAsset(meta)}`;
}

export function manifestEntryFromStored(asset: {
  id: string;
  name: string;
  mimeType: string;
  kind?: 'map' | 'token';
  createdAt: number;
}): AssetManifestEntry {
  const file = assetFileName(asset.id, asset);
  return {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    kind: asset.kind,
    createdAt: asset.createdAt,
    file,
  };
}

export function manifestEntryFromPayload(asset: {
  id: string;
  name: string;
  mimeType: string;
  kind?: 'map' | 'token';
  createdAt: number;
}): AssetManifestEntry {
  return manifestEntryFromStored(asset);
}
