import type { Campaign, TokenLibraryLayout } from '../../src/lib/types.js';

import { COMPANION_MESSAGE_SOURCE } from './constants.js';

/** Asset blob transferred over extension ↔ host wire (base64). */
export interface CompanionAssetPayload {
  id: string;
  name: string;
  mimeType: string;
  kind?: 'map' | 'token';
  createdAt: number;
  /** Base64-encoded file bytes */
  dataBase64: string;
}

/** Page → extension (via content script `postMessage`) */
export type PageToExtensionMessage =
  | { type: 'ping'; requestId: string }
  | { type: 'getStatus'; requestId: string }
  | {
      type: 'saveCampaign';
      requestId: string;
      campaign: Campaign;
      assets: CompanionAssetPayload[];
    }
  | {
      type: 'saveGlobal';
      requestId: string;
      tokenLibrary: TokenLibraryLayout | null;
      assets: CompanionAssetPayload[];
    }
  | { type: 'deleteCampaign'; requestId: string; campaignId: string }
  | { type: 'loadCampaign'; requestId: string; campaignId: string }
  | { type: 'loadGlobal'; requestId: string }
  | { type: 'listCampaigns'; requestId: string }
  | { type: 'chooseSaveFolder'; requestId: string };

/** Extension → page */
export type ExtensionToPageMessage =
  | { type: 'pong'; requestId: string; protocolVersion: number }
  | {
      type: 'status';
      requestId: string;
      connected: boolean;
      saveFolder: string | null;
      hostVersion: string | null;
      error: string | null;
    }
  | { type: 'ok'; requestId: string }
  | { type: 'error'; requestId: string; error: string }
  | {
      type: 'loadCampaignResult';
      requestId: string;
      campaign: Campaign;
      assets: CompanionAssetPayload[];
    }
  | {
      type: 'loadGlobalResult';
      requestId: string;
      tokenLibrary: TokenLibraryLayout | null;
      assets: CompanionAssetPayload[];
    }
  | { type: 'listCampaignsResult'; requestId: string; campaignIds: string[] };

const EXTENSION_REPLY_TYPES = new Set<ExtensionToPageMessage['type']>([
  'pong',
  'status',
  'ok',
  'error',
  'loadCampaignResult',
  'loadGlobalResult',
  'listCampaignsResult',
]);

export function isExtensionToPageMessage(value: unknown): value is ExtensionToPageMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as ExtensionToPageMessage;
  return (
    typeof msg.type === 'string' &&
    typeof msg.requestId === 'string' &&
    EXTENSION_REPLY_TYPES.has(msg.type as ExtensionToPageMessage['type'])
  );
}
export type ExtensionToHostMessage =
  | { type: 'ping' }
  | { type: 'getStatus' }
  | { type: 'deleteCampaign'; campaignId: string }
  | { type: 'cancelSession'; sessionId: string }
  | { type: 'saveCampaignBegin'; sessionId: string; campaign: Campaign }
  | { type: 'saveGlobalBegin'; sessionId: string; tokenLibrary: TokenLibraryLayout | null }
  | { type: 'saveAsset'; sessionId: string; asset: CompanionAssetPayload }
  | {
      type: 'saveAssetPart';
      sessionId: string;
      assetId: string;
      partIndex: number;
      partCount: number;
      dataBase64: string;
      name?: string;
      mimeType?: string;
      kind?: 'map' | 'token';
      createdAt?: number;
    }
  | { type: 'saveCampaignCommit'; sessionId: string }
  | { type: 'saveGlobalCommit'; sessionId: string }
  | { type: 'loadCampaignBegin'; sessionId: string; campaignId: string }
  | { type: 'loadGlobalBegin'; sessionId: string }
  | { type: 'listCampaigns' }
  | { type: 'chooseSaveFolder' };

/** Native host → extension (stdio JSON body) */
export type HostToExtensionMessage =
  | { type: 'pong'; protocolVersion: number; hostVersion: string }
  | {
      type: 'status';
      saveFolder: string | null;
      hostVersion: string;
      error: string | null;
    }
  | { type: 'ok'; path?: string }
  | { type: 'error'; error: string }
  | { type: 'sessionAck'; sessionId: string }
  | { type: 'loadCampaignData'; sessionId: string; campaign: Campaign }
  | { type: 'loadAsset'; sessionId: string; asset: CompanionAssetPayload }
  | {
      type: 'loadAssetPart';
      sessionId: string;
      assetId: string;
      partIndex: number;
      partCount: number;
      dataBase64: string;
      name?: string;
      mimeType?: string;
      kind?: 'map' | 'token';
      createdAt?: number;
    }
  | { type: 'loadCampaignComplete'; sessionId: string }
  | { type: 'loadGlobalData'; sessionId: string; tokenLibrary: TokenLibraryLayout | null }
  | { type: 'loadGlobalComplete'; sessionId: string }
  | { type: 'listCampaignsResult'; campaignIds: string[] };

export function isPageToExtensionMessage(value: unknown): value is PageToExtensionMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as PageToExtensionMessage;
  return typeof msg.type === 'string' && typeof msg.requestId === 'string';
}

export function isCompanionPageEnvelope(
  value: unknown,
): value is { source: typeof COMPANION_MESSAGE_SOURCE; payload: PageToExtensionMessage } {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as { source?: string; payload?: unknown };
  return envelope.source === COMPANION_MESSAGE_SOURCE && isPageToExtensionMessage(envelope.payload);
}

export function isCompanionExtensionEnvelope(
  value: unknown,
): value is { source: typeof COMPANION_MESSAGE_SOURCE; payload: ExtensionToPageMessage } {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as { source?: string; payload?: unknown };
  if (envelope.source !== COMPANION_MESSAGE_SOURCE) return false;
  return isExtensionToPageMessage(envelope.payload);
}

/** @deprecated Use isCompanionPageEnvelope */
export function isCompanionEnvelope(
  value: unknown,
): value is { source: typeof COMPANION_MESSAGE_SOURCE; payload: PageToExtensionMessage } {
  return isCompanionPageEnvelope(value);
}

export function wrapPageMessage(payload: PageToExtensionMessage): {
  source: typeof COMPANION_MESSAGE_SOURCE;
  payload: PageToExtensionMessage;
} {
  return { source: COMPANION_MESSAGE_SOURCE, payload };
}

export function wrapExtensionReply(payload: ExtensionToPageMessage): {
  source: typeof COMPANION_MESSAGE_SOURCE;
  payload: ExtensionToPageMessage;
} {
  return { source: COMPANION_MESSAGE_SOURCE, payload };
}

/** Normalize sendMessage / postMessage values into a page reply payload. */
export function coerceExtensionToPageMessage(value: unknown): ExtensionToPageMessage | null {
  if (isCompanionExtensionEnvelope(value)) return value.payload;
  if (isExtensionToPageMessage(value)) return value;
  return null;
}

/** Read page → extension payload from sendMessage body (envelope or bare). */
export function readPageToExtensionPayload(message: unknown): PageToExtensionMessage | null {
  if (isCompanionPageEnvelope(message)) return message.payload;
  if (isPageToExtensionMessage(message)) return message;
  return null;
}
