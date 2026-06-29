/** Native messaging host id — must match manifest `name` and extension `connectNative` arg. */
export const NATIVE_HOST_NAME = 'com.battlestandard.savehelper';

/** Protocol version bumped when wire format changes incompatibly. */
export const COMPANION_PROTOCOL_VERSION = 2;

/** Max UTF-8 JSON body size per native message (~768KB; Chrome limit ~1MB). */
export const NATIVE_JSON_MAX_BYTES = 768 * 1024;

/** `postMessage` / extension bridge source tag (must match on page + content script). */
export const COMPANION_MESSAGE_SOURCE = 'battle-standard-companion';

/** Placeholder — replace after publishing to Chrome Web Store (or use unpacked id in dev). */
export const EXTENSION_ID_PLACEHOLDER = 'REPLACE_WITH_EXTENSION_ID';

/**
 * Origins allowed to talk to the extension (manifest `externally_connectable`).
 * Add production GitHub Pages URL and local dev origins.
 */
export const ALLOWED_WEB_ORIGINS = [
  'https://localhost:5173',
  'http://localhost:5173',
  'https://127.0.0.1:5173',
  'http://127.0.0.1:5173',
] as const;

/** On-disk layout — aligned with src/lib/stableStorage/types.ts */
export const DISK_LAYOUT = {
  rootManifest: 'battle-map-storage.json',
  globalDir: 'global',
  campaignsDir: 'campaigns',
  campaignJson: 'campaign.json',
  tokenLibraryJson: 'token-library.json',
  assetsDir: 'assets',
  assetsManifest: 'manifest.json',
} as const;
