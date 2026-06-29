import type { Campaign, TokenLibraryLayout } from '../../../src/lib/types.js';
import type { CompanionAssetPayload, ExtensionToHostMessage, HostToExtensionMessage } from '../../protocol/messages.js';
import {
  encodeLoadAssetMessages,
  reassembleAssetParts,
  type AssetPartMeta,
} from '../../protocol/session.js';
import type { HostConfig } from './diskWriter.js';
import {
  readCampaignFromDisk,
  readGlobalFromDisk,
  writeCampaignToDisk,
  writeGlobalToDisk,
} from './diskWriter.js';

type SaveSessionKind = 'campaign' | 'global';

interface SaveSessionState {
  kind: SaveSessionKind;
  campaign?: Campaign;
  tokenLibrary?: TokenLibraryLayout | null;
  assets: CompanionAssetPayload[];
  pendingParts: Map<string, { meta: AssetPartMeta; parts: string[]; partCount: number }>;
}

const saveSessions = new Map<string, SaveSessionState>();

function ack(sessionId: string): HostToExtensionMessage {
  return { type: 'sessionAck', sessionId };
}

function clearSession(sessionId: string): void {
  saveSessions.delete(sessionId);
}

function requireSaveSession(sessionId: string): SaveSessionState {
  const session = saveSessions.get(sessionId);
  if (!session) throw new Error(`Unknown or expired session: ${sessionId}`);
  return session;
}

function ingestSaveAsset(session: SaveSessionState, asset: CompanionAssetPayload): void {
  const idx = session.assets.findIndex((a) => a.id === asset.id);
  if (idx >= 0) session.assets[idx] = asset;
  else session.assets.push(asset);
}

function ingestSaveAssetPart(
  session: SaveSessionState,
  message: Extract<ExtensionToHostMessage, { type: 'saveAssetPart' }>,
): void {
  let pending = session.pendingParts.get(message.assetId);
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
      partCount: message.partCount,
    };
    session.pendingParts.set(message.assetId, pending);
  }
  pending.parts[message.partIndex] = message.dataBase64;
  if (pending.parts.every((p) => p.length > 0)) {
    ingestSaveAsset(session, reassembleAssetParts(pending.meta, pending.parts));
    session.pendingParts.delete(message.assetId);
  }
}

export async function handleSessionMessage(
  config: HostConfig,
  message: ExtensionToHostMessage,
): Promise<HostToExtensionMessage | HostToExtensionMessage[]> {
  switch (message.type) {
    case 'cancelSession':
      clearSession(message.sessionId);
      return ack(message.sessionId);

    case 'saveCampaignBegin':
      saveSessions.set(message.sessionId, {
        kind: 'campaign',
        campaign: message.campaign,
        assets: [],
        pendingParts: new Map(),
      });
      return ack(message.sessionId);

    case 'saveGlobalBegin':
      saveSessions.set(message.sessionId, {
        kind: 'global',
        tokenLibrary: message.tokenLibrary,
        assets: [],
        pendingParts: new Map(),
      });
      return ack(message.sessionId);

    case 'saveAsset': {
      const session = requireSaveSession(message.sessionId);
      ingestSaveAsset(session, message.asset);
      return ack(message.sessionId);
    }

    case 'saveAssetPart': {
      const session = requireSaveSession(message.sessionId);
      ingestSaveAssetPart(session, message);
      return ack(message.sessionId);
    }

    case 'saveCampaignCommit': {
      const session = requireSaveSession(message.sessionId);
      if (session.kind !== 'campaign' || !session.campaign) {
        throw new Error('saveCampaignCommit requires an active campaign session');
      }
      if (session.pendingParts.size > 0) {
        throw new Error('Incomplete asset parts in save session');
      }
      const path = await writeCampaignToDisk(config, {
        campaign: session.campaign,
        assets: session.assets,
      });
      clearSession(message.sessionId);
      return { type: 'ok', path };
    }

    case 'saveGlobalCommit': {
      const session = requireSaveSession(message.sessionId);
      if (session.kind !== 'global') {
        throw new Error('saveGlobalCommit requires an active global session');
      }
      if (session.pendingParts.size > 0) {
        throw new Error('Incomplete asset parts in save session');
      }
      const path = await writeGlobalToDisk(config, {
        tokenLibrary: session.tokenLibrary ?? null,
        assets: session.assets,
      });
      clearSession(message.sessionId);
      return { type: 'ok', path };
    }

    case 'loadCampaignBegin': {
      const bundle = await readCampaignFromDisk(config, message.campaignId);
      if (!bundle) {
        return { type: 'error', error: `Campaign not found: ${message.campaignId}` };
      }
      const responses: HostToExtensionMessage[] = [
        { type: 'loadCampaignData', sessionId: message.sessionId, campaign: bundle.campaign },
      ];
      for (const asset of bundle.assets) {
        responses.push(...encodeLoadAssetMessages(message.sessionId, asset));
      }
      responses.push({ type: 'loadCampaignComplete', sessionId: message.sessionId });
      return responses;
    }

    case 'loadGlobalBegin': {
      const bundle = await readGlobalFromDisk(config);
      const responses: HostToExtensionMessage[] = [
        { type: 'loadGlobalData', sessionId: message.sessionId, tokenLibrary: bundle.tokenLibrary },
      ];
      for (const asset of bundle.assets) {
        responses.push(...encodeLoadAssetMessages(message.sessionId, asset));
      }
      responses.push({ type: 'loadGlobalComplete', sessionId: message.sessionId });
      return responses;
    }

    default:
      return { type: 'error', error: 'Not a session message' };
  }
}

export function resetSessionsForTests(): void {
  saveSessions.clear();
}

export function isSessionMessage(message: ExtensionToHostMessage): boolean {
  switch (message.type) {
    case 'saveCampaignBegin':
    case 'saveGlobalBegin':
    case 'saveAsset':
    case 'saveAssetPart':
    case 'saveCampaignCommit':
    case 'saveGlobalCommit':
    case 'loadCampaignBegin':
    case 'loadGlobalBegin':
    case 'cancelSession':
      return true;
    default:
      return false;
  }
}
