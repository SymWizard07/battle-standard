import { joinRoom } from '@trystero-p2p/mqtt';
import type { Room } from '@trystero-p2p/core';
import type { SelectionPayload } from '../sync/peerSelection';
// SelectionPayload type only — keeps transport free of store imports.
import type { SessionRole } from '../lib/types';
import type { StoredAsset } from '../lib/db';

export const TRYSTERO_APP_ID = 'battle-standard';
const HANDSHAKE_TIMEOUT_MS = 30_000;

export type PresencePayload = {
  playerName: string;
  role: SessionRole;
};

export type MetaPayload = {
  host: string;
  activeSceneId: string;
};

export type AssetMetadata = {
  assetId: string;
  mimeType: string;
  name: string;
  kind?: StoredAsset['kind'];
  createdAt: number;
};

export type RoomHandlers = {
  onStatus?: (status: string) => void;
  onJoinError?: (peerId: string, error: string) => void;
  onPeerJoin?: (peerId: string, peerCount: number) => void;
  onPeerLeave?: (peerId: string, peerCount: number) => void;
  onPresence?: (payload: PresencePayload, peerId: string) => void;
  onSelection?: (payload: SelectionPayload, peerId: string) => void;
  onCampaign?: (json: string, peerId: string) => void;
  onMeta?: (payload: MetaPayload, peerId: string) => void;
  onAsset?: (data: ArrayBuffer, metadata: AssetMetadata, peerId: string) => void;
};

let room: Room | null = null;
let connectedPeers = new Set<string>();
let activeRoomName = '';
let handlers: RoomHandlers = {};
let sendCampaign: ((json: string) => Promise<void>) | null = null;
let sendPresence: ((data: PresencePayload) => Promise<void>) | null = null;
let sendSelection: ((data: SelectionPayload) => Promise<void>) | null = null;
let sendMeta: ((data: MetaPayload) => Promise<void>) | null = null;
let sendAsset: ((
  data: ArrayBuffer,
  metadata: AssetMetadata,
) => Promise<void>) | null = null;

const hasRequiredCrypto = Boolean(
  typeof window !== 'undefined' && window.crypto?.subtle,
);

export function getActiveRoomName(): string {
  return activeRoomName;
}

export function getConnectedPeerCount(): number {
  return connectedPeers.size;
}

export function hasRequiredCryptoContext(): boolean {
  return hasRequiredCrypto;
}

export async function leaveRoom(): Promise<void> {
  const active = room;
  room = null;
  connectedPeers = new Set();
  activeRoomName = '';
  handlers = {};
  sendCampaign = null;
  sendPresence = null;
  sendSelection = null;
  sendMeta = null;
  sendAsset = null;

  if (active) {
    await active.leave();
  }
}

export function publishCampaign(json: string): void {
  void sendCampaign?.(json);
}

export function announcePresence(payload: PresencePayload): void {
  void sendPresence?.(payload);
}

export function publishSelection(payload: SelectionPayload): void {
  void sendSelection?.(payload);
}

export function publishMeta(payload: MetaPayload): void {
  void sendMeta?.(payload);
}

export function publishAsset(data: ArrayBuffer, metadata: AssetMetadata): void {
  void sendAsset?.(data, metadata);
}

function attachRoomActions(activeRoom: Room): void {
  const campaignAction = activeRoom.makeAction<string>('campaign');
  sendCampaign = (json) => campaignAction.send(json);
  campaignAction.onMessage = (json, { peerId }) => {
    handlers.onCampaign?.(json, peerId);
  };

  const presenceAction = activeRoom.makeAction<PresencePayload>('presence');
  sendPresence = (data) => presenceAction.send(data);
  presenceAction.onMessage = (data, { peerId }) => {
    handlers.onPresence?.(data, peerId);
  };

  const selectionAction = activeRoom.makeAction<SelectionPayload>('selection');
  sendSelection = (data) => selectionAction.send(data);
  selectionAction.onMessage = (data, { peerId }) => {
    handlers.onSelection?.(data, peerId);
  };

  const metaAction = activeRoom.makeAction<MetaPayload>('meta');
  sendMeta = (data) => metaAction.send(data);
  metaAction.onMessage = (data, { peerId }) => {
    handlers.onMeta?.(data, peerId);
  };

  const assetAction = activeRoom.makeAction<ArrayBuffer>('asset');
  sendAsset = (data, metadata) =>
    assetAction.send(data, { metadata: metadata as never });
  assetAction.onMessage = (data, { peerId, metadata }) => {
    if (!metadata || typeof metadata !== 'object') return;
    const meta = metadata as AssetMetadata;
    if (typeof meta.assetId !== 'string') return;
    handlers.onAsset?.(data, meta, peerId);
  };
}

export async function joinNamedRoom(
  roomName: string,
  nextHandlers: RoomHandlers,
): Promise<boolean> {
  const normalizedRoomName = roomName.trim().toUpperCase();
  if (!normalizedRoomName) return false;

  if (room) {
    await room.leave();
    room = null;
    connectedPeers = new Set();
  }

  handlers = nextHandlers;
  activeRoomName = normalizedRoomName;
  connectedPeers = new Set();
  sendCampaign = null;
  sendPresence = null;
  sendSelection = null;
  sendMeta = null;
  sendAsset = null;

  if (!hasRequiredCrypto) {
    handlers.onStatus?.('Needs HTTPS or localhost');
    return false;
  }

  handlers.onStatus?.('Joining room...');

  room = joinRoom({ appId: TRYSTERO_APP_ID }, normalizedRoomName, {
    handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
    onJoinError: ({ peerId, error }) => {
      handlers.onJoinError?.(peerId, formatError(error));
    },
  });

  attachRoomActions(room);

  room.onPeerJoin = (peerId) => {
    connectedPeers.add(peerId);
    handlers.onPeerJoin?.(peerId, connectedPeers.size);
    handlers.onStatus?.('Connected');
  };

  room.onPeerLeave = (peerId) => {
    connectedPeers.delete(peerId);
    const status = connectedPeers.size
      ? 'Connected'
      : 'Waiting for another peer';
    handlers.onStatus?.(status);
    handlers.onPeerLeave?.(peerId, connectedPeers.size);
  };

  handlers.onStatus?.('Waiting for another peer');
  return true;
}

function formatError(error: unknown): string {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message;
  return String(error);
}
