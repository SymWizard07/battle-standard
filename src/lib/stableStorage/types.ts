import type { Campaign, TokenLibraryLayout } from '../types';

export const STORAGE_SCHEMA_VERSION = 1;

export const ROOT_MANIFEST_FILE = 'battle-map-storage.json';
export const GLOBAL_DIR = 'global';
export const CAMPAIGNS_DIR = 'campaigns';
export const CAMPAIGN_JSON = 'campaign.json';
export const TOKEN_LIBRARY_JSON = 'token-library.json';
export const ASSETS_DIR = 'assets';
export const ASSETS_MANIFEST = 'manifest.json';

export interface RootManifest {
  version: number;
  campaigns: string[];
  lastSyncedAt: number;
}

export interface AssetManifestEntry {
  id: string;
  name: string;
  mimeType: string;
  kind?: 'map' | 'token';
  createdAt: number;
  file: string;
}

export interface AssetManifest {
  assets: AssetManifestEntry[];
}

export interface CampaignDiskBundle {
  campaign: Campaign;
  assets: AssetManifestEntry[];
  assetBlobs: Map<string, Blob>;
}

export interface GlobalDiskBundle {
  tokenLibrary: TokenLibraryLayout | null;
  assets: AssetManifestEntry[];
  assetBlobs: Map<string, Blob>;
}
