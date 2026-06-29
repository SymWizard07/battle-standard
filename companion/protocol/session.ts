import type { Campaign, TokenLibraryLayout } from '../../src/lib/types.js';
import { NATIVE_JSON_MAX_BYTES } from './constants.js';
import type { CompanionAssetPayload, ExtensionToHostMessage, HostToExtensionMessage } from './messages.js';

export { NATIVE_JSON_MAX_BYTES };

export function newSessionId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function estimateJsonByteLength(value: unknown): number {
  const json = JSON.stringify(value);
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(json, 'utf8');
  }
  return new TextEncoder().encode(json).length;
}

export interface AssetPartMeta {
  id: string;
  name: string;
  mimeType: string;
  kind?: 'map' | 'token';
  createdAt: number;
}

export function splitBase64ForParts(
  dataBase64: string,
  maxPartBytes: number,
): string[] {
  if (dataBase64.length <= maxPartBytes) return [dataBase64];
  const parts: string[] = [];
  for (let i = 0; i < dataBase64.length; i += maxPartBytes) {
    parts.push(dataBase64.slice(i, i + maxPartBytes));
  }
  return parts;
}

function saveAssetPartOverhead(
  sessionId: string,
  assetId: string,
  partIndex: number,
  partCount: number,
  meta?: AssetPartMeta,
): number {
  const shell: Record<string, unknown> = {
    type: 'saveAssetPart',
    sessionId,
    assetId,
    partIndex,
    partCount,
    dataBase64: '',
  };
  if (partIndex === 0 && meta) {
    shell.name = meta.name;
    shell.mimeType = meta.mimeType;
    shell.kind = meta.kind;
    shell.createdAt = meta.createdAt;
  }
  return estimateJsonByteLength(shell);
}

export function maxBase64CharsPerAssetPart(
  sessionId: string,
  assetId: string,
  partCount: number,
  meta: AssetPartMeta,
): number {
  const overhead = saveAssetPartOverhead(sessionId, assetId, 0, partCount, meta);
  return Math.max(1024, Math.floor((NATIVE_JSON_MAX_BYTES - overhead) * 0.95));
}

export function encodeAssetMessages(
  sessionId: string,
  asset: CompanionAssetPayload,
): ExtensionToHostMessage[] {
  const single: ExtensionToHostMessage = { type: 'saveAsset', sessionId, asset };
  if (estimateJsonByteLength(single) <= NATIVE_JSON_MAX_BYTES) {
    return [single];
  }

  const meta: AssetPartMeta = {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    kind: asset.kind,
    createdAt: asset.createdAt,
  };

  let partCount = 2;
  let parts: string[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const maxChars = maxBase64CharsPerAssetPart(sessionId, asset.id, partCount, meta);
    parts = splitBase64ForParts(asset.dataBase64, maxChars);
    partCount = parts.length;
    const messages = parts.map(
      (dataBase64, partIndex): ExtensionToHostMessage => ({
        type: 'saveAssetPart',
        sessionId,
        assetId: asset.id,
        partIndex,
        partCount,
        dataBase64,
        ...(partIndex === 0
          ? {
              name: meta.name,
              mimeType: meta.mimeType,
              kind: meta.kind,
              createdAt: meta.createdAt,
            }
          : {}),
      }),
    );
    if (messages.every((m) => estimateJsonByteLength(m) <= NATIVE_JSON_MAX_BYTES)) {
      return messages;
    }
    partCount = parts.length + 1;
  }

  throw new Error(`Asset ${asset.id} exceeds native messaging size limits.`);
}

export function encodeSaveCampaignSession(
  campaign: Campaign,
  assets: CompanionAssetPayload[],
  sessionId: string = newSessionId(),
): ExtensionToHostMessage[] {
  const messages: ExtensionToHostMessage[] = [
    { type: 'saveCampaignBegin', sessionId, campaign },
  ];
  for (const asset of assets) {
    messages.push(...encodeAssetMessages(sessionId, asset));
  }
  messages.push({ type: 'saveCampaignCommit', sessionId });
  return messages;
}

export function encodeSaveGlobalSession(
  tokenLibrary: TokenLibraryLayout | null,
  assets: CompanionAssetPayload[],
  sessionId: string = newSessionId(),
): ExtensionToHostMessage[] {
  const messages: ExtensionToHostMessage[] = [
    { type: 'saveGlobalBegin', sessionId, tokenLibrary },
  ];
  for (const asset of assets) {
    messages.push(...encodeAssetMessages(sessionId, asset));
  }
  messages.push({ type: 'saveGlobalCommit', sessionId });
  return messages;
}

export function encodeLoadAssetMessages(
  sessionId: string,
  asset: CompanionAssetPayload,
): HostToExtensionMessage[] {
  const single: HostToExtensionMessage = { type: 'loadAsset', sessionId, asset };
  if (estimateJsonByteLength(single) <= NATIVE_JSON_MAX_BYTES) {
    return [single];
  }

  const meta: AssetPartMeta = {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    kind: asset.kind,
    createdAt: asset.createdAt,
  };

  let partCount = 2;
  for (let attempt = 0; attempt < 8; attempt++) {
    const maxChars = maxBase64CharsPerAssetPart(sessionId, asset.id, partCount, meta);
    const parts = splitBase64ForParts(asset.dataBase64, maxChars);
    partCount = parts.length;
    const messages = parts.map(
      (dataBase64, partIndex): HostToExtensionMessage => ({
        type: 'loadAssetPart',
        sessionId,
        assetId: asset.id,
        partIndex,
        partCount,
        dataBase64,
        ...(partIndex === 0
          ? {
              name: meta.name,
              mimeType: meta.mimeType,
              kind: meta.kind,
              createdAt: meta.createdAt,
            }
          : {}),
      }),
    );
    if (messages.every((m) => estimateJsonByteLength(m) <= NATIVE_JSON_MAX_BYTES)) {
      return messages;
    }
    partCount = parts.length + 1;
  }

  throw new Error(`Asset ${asset.id} exceeds native messaging size limits.`);
}

export function reassembleAssetParts(
  meta: AssetPartMeta,
  parts: string[],
): CompanionAssetPayload {
  return {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    kind: meta.kind,
    createdAt: meta.createdAt,
    dataBase64: parts.join(''),
  };
}

export function isLoadSessionComplete(message: HostToExtensionMessage): boolean {
  return message.type === 'loadCampaignComplete' || message.type === 'loadGlobalComplete';
}

export interface AssembledLoadCampaign {
  campaign: Campaign;
  assets: CompanionAssetPayload[];
}

export interface AssembledLoadGlobal {
  tokenLibrary: TokenLibraryLayout | null;
  assets: CompanionAssetPayload[];
}

export function assembleLoadCampaignResponses(
  messages: HostToExtensionMessage[],
): AssembledLoadCampaign {
  let campaign: Campaign | null = null;
  const assets: CompanionAssetPayload[] = [];
  const partBuffers = new Map<string, { meta: AssetPartMeta; parts: string[] }>();

  for (const message of messages) {
    switch (message.type) {
      case 'loadCampaignData':
        campaign = message.campaign;
        break;
      case 'loadAsset':
        assets.push(message.asset);
        break;
      case 'loadAssetPart': {
        let pending = partBuffers.get(message.assetId);
        if (!pending) {
          if (message.partIndex !== 0 || message.name == null || message.mimeType == null) {
            throw new Error(`Missing metadata for asset part ${message.assetId}`);
          }
          pending = {
            meta: {
              id: message.assetId,
              name: message.name,
              mimeType: message.mimeType,
              kind: message.kind,
              createdAt: message.createdAt ?? 0,
            },
            parts: new Array(message.partCount).fill(''),
          };
          partBuffers.set(message.assetId, pending);
        }
        pending.parts[message.partIndex] = message.dataBase64;
        if (pending.parts.every((p) => p.length > 0)) {
          assets.push(reassembleAssetParts(pending.meta, pending.parts));
          partBuffers.delete(message.assetId);
        }
        break;
      }
      case 'loadCampaignComplete':
        break;
      default:
        break;
    }
  }

  if (!campaign) throw new Error('loadCampaignComplete missing campaign data');
  return { campaign, assets };
}

export function assembleLoadGlobalResponses(
  messages: HostToExtensionMessage[],
): AssembledLoadGlobal {
  let tokenLibrary: TokenLibraryLayout | null = null;
  const assets: CompanionAssetPayload[] = [];
  const partBuffers = new Map<string, { meta: AssetPartMeta; parts: string[] }>();

  for (const message of messages) {
    switch (message.type) {
      case 'loadGlobalData':
        tokenLibrary = message.tokenLibrary;
        break;
      case 'loadAsset':
        assets.push(message.asset);
        break;
      case 'loadAssetPart': {
        let pending = partBuffers.get(message.assetId);
        if (!pending) {
          if (message.partIndex !== 0 || message.name == null || message.mimeType == null) {
            throw new Error(`Missing metadata for asset part ${message.assetId}`);
          }
          pending = {
            meta: {
              id: message.assetId,
              name: message.name,
              mimeType: message.mimeType,
              kind: message.kind,
              createdAt: message.createdAt ?? 0,
            },
            parts: new Array(message.partCount).fill(''),
          };
          partBuffers.set(message.assetId, pending);
        }
        pending.parts[message.partIndex] = message.dataBase64;
        if (pending.parts.every((p) => p.length > 0)) {
          assets.push(reassembleAssetParts(pending.meta, pending.parts));
          partBuffers.delete(message.assetId);
        }
        break;
      }
      case 'loadGlobalComplete':
        break;
      default:
        break;
    }
  }

  return { tokenLibrary, assets };
}
