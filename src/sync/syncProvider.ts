import { isTokenLockedForPlayers } from '../lib/tokenVisibility';
import type { Campaign, SceneId, SessionRole } from '../lib/types';
import { deepEqual } from '../lib/history/equal';
import { flushPersistFromSync, schedulePersistFromSync, useStore } from '../store/useStore';
import { selfId } from '@trystero-p2p/mqtt';
import {
  announcePresence,
  getConnectedPeerCount,
  hasRequiredCryptoContext,
  joinNamedRoom,
  leaveRoom,
  publishCampaign,
  publishMeta,
  publishSelection,
  type MetaPayload,
  type PresencePayload,
  type RoomHandlers,
} from '../net/trysteroRoom';
import {
  canSessionMoveToken,
  clearPeerSelections,
  removePeerSelection,
  selectionPayloadFromStore,
  setPeerSelection,
  type SelectionPayload,
} from './peerSelection';
import {
  clearAssetSyncState,
  handleRemoteAsset,
  hydrateAssetsForCampaign,
  pushAllAssetsReliable,
  wireGmAssetSync,
} from './assetSync';
import { mergeCampaignForSync } from './campaignMerge';
import {
  shouldFlushPersistOnDisconnect,
  shouldPersistAfterRemoteMerge,
} from './syncRemotePersist';
import {
  attachLiveSync,
  stripLiveSync,
  type SyncCampaignPayload,
} from './liveSyncPayload';
import {
  feedRemoteSceneMotion,
  startRemoteMotion,
  stopRemoteMotion,
} from './remoteMotion';
import {
  buildCampaignSyncSnapshot,
  buildLiveSyncEnvelope,
  hasLivePreviews,
  type LiveSyncState,
} from './syncSnapshot';
import {
  clearSession,
  isSessionValid,
  loadSession,
  refreshSessionExpiry,
  saveSession,
} from './sessionReconnect';

const RECONNECT_INTERVAL_MS = 2000;
const PEER_LOSS_DEBOUNCE_MS = 2000;
const JOIN_RETRY_SETTLE_MS = 100;
const RELIABLE_RETRY_MS = 400;
const RELIABLE_MAX_ATTEMPTS = 12;
const LIVE_SYNC_MS = 80;

let sessionActive = false;
let unsubscribeStore: (() => void) | null = null;
let unsubscribeAssetSync: (() => void) | null = null;
let reconnectTimer: ReturnType<typeof setInterval> | null = null;
let peerLossTimer: ReturnType<typeof setTimeout> | null = null;
let campaignRetryTimer: ReturnType<typeof setInterval> | null = null;
let intentionalDisconnect = false;
let suppressReconnect = false;
let hadPeersWhileConnected = false;
let joinRetryRoom: string | null = null;
let playerReceivedHostCampaign = false;
let pendingCampaign: string | null = null;
let currentConnectParams: ConnectParams | null = null;
let liveSyncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingEphemeralClear = false;

type ConnectParams = {
  roomCode: string;
  role: SessionRole;
  playerName: string;
  campaignId: string;
};

type SyncSession = {
  applyingRemote: boolean;
};

const syncSession: SyncSession = { applyingRemote: false };

function setReconnecting(active: boolean): void {
  useStore.getState().setReconnecting(active);
}

function stopReconnectLoop(): void {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
  if (peerLossTimer) {
    clearTimeout(peerLossTimer);
    peerLossTimer = null;
  }
  setReconnecting(false);
}

function clearCampaignSyncRetry(): void {
  if (campaignRetryTimer) {
    clearInterval(campaignRetryTimer);
    campaignRetryTimer = null;
  }
}

function clearLiveSyncThrottle(): void {
  if (liveSyncTimer) {
    clearTimeout(liveSyncTimer);
    liveSyncTimer = null;
  }
}

function liveSyncStateFromStore(
  state: ReturnType<typeof useStore.getState>,
): LiveSyncState {
  return {
    campaign: state.campaign,
    activeSceneId: state.activeSceneId,
    movePreviewPositions: state.movePreviewPositions,
    scalePreviewById: state.scalePreviewById,
    drawStrokeDragPreview: state.drawStrokeDragPreview,
    ephemeralMeasure: state.ephemeralMeasure,
    playerName: state.playerName,
    drawHue: state.drawHue,
  };
}

function publishCampaignFromStore(
  role: SessionRole,
  options?: { clearEphemeral?: boolean },
): void {
  if (role === 'player' && !playerReceivedHostCampaign) return;
  const state = useStore.getState();
  const liveState = liveSyncStateFromStore(state);
  const snapshot = buildCampaignSyncSnapshot(liveState);
  if (!snapshot) return;
  const payload = attachLiveSync(
    snapshot,
    buildLiveSyncEnvelope(liveState, { clearEphemeral: options?.clearEphemeral }),
  );
  publishCampaign(JSON.stringify(payload));
}

function scheduleLiveSyncPublish(
  role: SessionRole,
  options?: { clearEphemeral?: boolean },
): void {
  if (options?.clearEphemeral) pendingEphemeralClear = true;
  if (liveSyncTimer) return;
  liveSyncTimer = setTimeout(() => {
    liveSyncTimer = null;
    if (syncSession.applyingRemote || !sessionActive) return;
    const state = useStore.getState();
    if (state.role !== role) return;
    const liveState = liveSyncStateFromStore(state);
    if (!hasLivePreviews(liveState) && !pendingEphemeralClear) return;
    const clearEphemeral = pendingEphemeralClear;
    pendingEphemeralClear = false;
    publishCampaignFromStore(role, { clearEphemeral });
  }, LIVE_SYNC_MS);
}

function markPlayerConnected(): void {
  if (playerReceivedHostCampaign) return;
  playerReceivedHostCampaign = true;
  refreshSessionExpiry();
  stopReconnectLoop();
  useStore.getState().setSyncStatus('connected');
}

function isValidCampaignJson(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as Campaign;
    return typeof parsed?.id === 'string';
  } catch {
    return false;
  }
}

function applyRemoteCampaign(json: string, role: SessionRole): void {
  if (!isValidCampaignJson(json)) return;
  try {
    const payload = JSON.parse(json) as SyncCampaignPayload;
    const remote = stripLiveSync(payload);
    const liveSync = payload.liveSync;
    const local = useStore.getState().campaign;
    const activeSceneId = useStore.getState().activeSceneId;
    const sceneId =
      liveSync?.sceneId ?? remote.lastActiveSceneId ?? activeSceneId ?? undefined;
    const prevScene = sceneId ? local?.scenes[sceneId] : undefined;
    const remoteScene = sceneId ? remote.scenes[sceneId] : undefined;

    const next =
      local != null
        ? mergeCampaignForSync(local, remote, role, {
            preserveLocalUnlockedGmTokens:
              role === 'player' && playerReceivedHostCampaign,
            localUpdatedAt: local.updatedAt,
            remoteUpdatedAt: remote.updatedAt,
          })
        : remote;
    const skipped = local != null && deepEqual(local, next);

    if (!skipped) {
      syncSession.applyingRemote = true;
      useStore.getState().setCampaignRemote(next);
      if (role === 'player') {
        markPlayerConnected();
      }
      syncSession.applyingRemote = false;
      if (shouldPersistAfterRemoteMerge(role, false)) {
        schedulePersistFromSync();
      }
    } else if (role === 'player') {
      markPlayerConnected();
    }

    feedRemoteSceneMotion(sceneId, prevScene, remoteScene, liveSync);
  } catch {
    useStore.getState().setSyncStatus('error');
  }
}

function handleIncomingCampaign(json: string, role: SessionRole): void {
  if (syncSession.applyingRemote) return;
  if (!isValidCampaignJson(json)) return;
  applyRemoteCampaign(json, role);
}

function flushPendingCampaign(): void {
  if (!pendingCampaign) return;
  const role = useStore.getState().role;
  if (role !== 'player') return;
  const json = pendingCampaign;
  pendingCampaign = null;
  applyRemoteCampaign(json, role);
}

function handleIncomingPresence(_payload: PresencePayload): void {
  // Homeworlds: presence updates nicknames and triggers host setup — not join success.
}

function handleIncomingMeta(payload: MetaPayload): void {
  const role = useStore.getState().role;
  if (role !== 'player') return;
  if (payload.activeSceneId) {
    useStore.getState().setActiveScene(payload.activeSceneId as SceneId);
  }
}

function publishCampaignReliable(): void {
  clearCampaignSyncRetry();
  const campaign = useStore.getState().campaign;
  if (!campaign) return;

  const json = JSON.stringify(campaign);
  const send = () => publishCampaign(json);
  send();

  let attempts = 0;
  campaignRetryTimer = setInterval(() => {
    const state = useStore.getState();
    if (state.role !== 'gm' || !state.campaign) {
      clearCampaignSyncRetry();
      return;
    }
    publishCampaign(JSON.stringify(state.campaign));
    attempts += 1;
    if (attempts >= RELIABLE_MAX_ATTEMPTS) clearCampaignSyncRetry();
  }, RELIABLE_RETRY_MS);
}

function publishCurrentMeta(): void {
  const state = useStore.getState();
  if (state.role !== 'gm') return;
  publishMeta({
    host: state.playerName,
    activeSceneId: state.activeSceneId ?? '',
  });
}

function publishSelectionFromStore(): void {
  publishSelection(selectionPayloadFromStore());
}

/** Publish the current selection to peers immediately (e.g. on select/deselect). */
export function syncSelectionNow(): void {
  if (!sessionActive) return;
  const payload = selectionPayloadFromStore();
  setPeerSelection(selfId, payload);
  publishSelection(payload);
}

function syncGmStateToPeers(): void {
  const state = useStore.getState();
  if (state.role !== 'gm') return;
  announcePresence({ playerName: state.playerName, role: 'gm' });
  publishSelectionFromStore();
  publishCampaignReliable();
  publishCurrentMeta();
  pushAllAssetsReliable(state.campaign);
}

function wireStoreSync(role: SessionRole): void {
  unsubscribeStore = useStore.subscribe((state, prev) => {
    if (syncSession.applyingRemote || state.role !== role || !sessionActive) return;

    const liveState = liveSyncStateFromStore(state);
    const previewsChanged =
      state.movePreviewPositions !== prev.movePreviewPositions ||
      state.drawStrokeDragPreview !== prev.drawStrokeDragPreview ||
      state.scalePreviewById !== prev.scalePreviewById;
    const ephemeralChanged = state.ephemeralMeasure !== prev.ephemeralMeasure;
    const ephemeralCleared =
      ephemeralChanged && prev.ephemeralMeasure != null && state.ephemeralMeasure == null;

    if (ephemeralCleared) {
      scheduleLiveSyncPublish(role, { clearEphemeral: true });
    } else if (
      (previewsChanged || ephemeralChanged) &&
      hasLivePreviews(liveState)
    ) {
      scheduleLiveSyncPublish(role);
    }

    if (state.campaign !== prev.campaign && state.campaign) {
      if (role === 'player' && !playerReceivedHostCampaign) return;
      clearLiveSyncThrottle();
      publishCampaignFromStore(role);
    }
    const selectionChanged =
      state.selectedTokenIds !== prev.selectedTokenIds ||
      state.selectedDrawStrokeIds !== prev.selectedDrawStrokeIds ||
      state.selectedMeasurementId !== prev.selectedMeasurementId ||
      state.selectDrawShapes !== prev.selectDrawShapes ||
      state.activeSceneId !== prev.activeSceneId;

    if (selectionChanged) {
      publishSelectionFromStore();
    }

    if (
      role === 'gm' &&
      state.activeSceneId !== prev.activeSceneId &&
      state.activeSceneId
    ) {
      publishCurrentMeta();
    }
  });
}

async function teardownSession(): Promise<void> {
  clearCampaignSyncRetry();
  clearLiveSyncThrottle();
  pendingEphemeralClear = false;
  stopRemoteMotion();
  clearPeerSelections();
  clearAssetSyncState();
  unsubscribeStore?.();
  unsubscribeStore = null;
  unsubscribeAssetSync?.();
  unsubscribeAssetSync = null;
  pendingCampaign = null;
  joinRetryRoom = null;
  playerReceivedHostCampaign = false;
  currentConnectParams = null;
  sessionActive = false;
  await leaveRoom();
}

export function disconnectSync(options?: { intentional?: boolean }): void {
  const intentional = options?.intentional ?? true;
  intentionalDisconnect = intentional;
  suppressReconnect = true;
  stopReconnectLoop();

  const state = useStore.getState();
  const preTeardown =
    shouldFlushPersistOnDisconnect(state.role, state.campaign != null)
      ? flushPersistFromSync()
      : Promise.resolve();

  void preTeardown.then(() => teardownSession());

  if (intentional) {
    clearSession();
    useStore.getState().setSyncStatus('offline');
    useStore.getState().setPeerCount(0);
    useStore.getState().setRoomCode(null);
    useStore.getState().setPlayerView(false);
  }

  hadPeersWhileConnected = false;
  queueMicrotask(() => {
    suppressReconnect = false;
    intentionalDisconnect = false;
  });
}

function startReconnectLoop(): void {
  if (reconnectTimer || intentionalDisconnect) return;

  const campaignId = useStore.getState().campaign?.id;
  if (!campaignId) return;

  const session = loadSession(campaignId);
  if (!session || !isSessionValid(session)) {
    clearSession();
    useStore.getState().setSyncStatus('offline');
    return;
  }

  setReconnecting(true);
  useStore.getState().setSyncStatus('connecting');

  const attempt = () => {
    const currentCampaignId = useStore.getState().campaign?.id;
    if (!currentCampaignId) {
      stopReconnectLoop();
      return;
    }
    const s = loadSession(currentCampaignId);
    if (!s || !isSessionValid(s)) {
      stopReconnectLoop();
      useStore.getState().setSyncStatus('offline');
      clearSession();
      return;
    }
    void connectSession(
      {
        roomCode: s.roomCode,
        role: s.role,
        playerName: s.playerName,
        campaignId: s.campaignId,
      },
      { fromReconnect: true },
    );
  };

  attempt();
  reconnectTimer = setInterval(attempt, RECONNECT_INTERVAL_MS);
}

function handlePeerCount(peerCount: number): void {
  const state = useStore.getState();
  useStore.getState().setPeerCount(peerCount);

  if (state.syncStatus === 'connected' && peerCount > 0) {
    hadPeersWhileConnected = true;
  }

  if (peerCount > 0 && useStore.getState().reconnecting) {
    stopReconnectLoop();
  }

  if (
    state.role === 'player' &&
    hadPeersWhileConnected &&
    peerCount === 0 &&
    !intentionalDisconnect &&
    !suppressReconnect &&
    state.syncStatus === 'connected'
  ) {
    if (peerLossTimer) clearTimeout(peerLossTimer);
    peerLossTimer = setTimeout(() => {
      peerLossTimer = null;
      const latest = useStore.getState();
      if (
        latest.role === 'player' &&
        latest.peerCount === 0 &&
        !intentionalDisconnect &&
        latest.syncStatus !== 'offline'
      ) {
        useStore.getState().setSyncStatus('connecting');
        startReconnectLoop();
      }
    }, PEER_LOSS_DEBOUNCE_MS);
  }
}

function wireRoomHandlers(params: ConnectParams): RoomHandlers {
  return {
    onStatus: (status) => {
      if (status === 'Needs HTTPS or localhost') {
        useStore.getState().setSyncStatus('error');
        return;
      }
      if (status === 'Connected') {
        refreshSessionExpiry();
        if (params.role === 'gm') {
          useStore.getState().setSyncStatus('connected');
        }
      } else if (status === 'Joining room...') {
        useStore.getState().setSyncStatus('connecting');
      }
    },
    onJoinError: (_peerId, error) => {
      const s = useStore.getState();
      if (
        error.includes('handshake timed out') &&
        s.roomCode &&
        s.role &&
        joinRetryRoom !== s.roomCode &&
        currentConnectParams
      ) {
        joinRetryRoom = s.roomCode;
        const retryParams = currentConnectParams;
        void (async () => {
          await teardownSession();
          await new Promise((resolve) => setTimeout(resolve, JOIN_RETRY_SETTLE_MS));
          await connectSession(retryParams, { fromReconnect: true });
        })();
        return;
      }
      useStore.getState().setSyncStatus('error');
    },
    onPeerJoin: (_peerId, peerCount) => {
      handlePeerCount(peerCount);
      const state = useStore.getState();
      announcePresence({
        playerName: state.playerName,
        role: state.role ?? 'player',
      });
      publishSelectionFromStore();
      if (state.role === 'gm') {
        syncGmStateToPeers();
      } else {
        flushPendingCampaign();
      }
    },
    onPeerLeave: (peerId, peerCount) => {
      handlePeerCount(peerCount);
      removePeerSelection(peerId);
    },
    onPresence: (payload) => {
      handleIncomingPresence(payload);
    },
    onSelection: (payload: SelectionPayload, peerId) => {
      if (peerId === selfId) return;
      setPeerSelection(peerId, payload);
    },
    onCampaign: (json, peerId) => {
      const role = useStore.getState().role ?? 'player';
      if (peerId === selfId) return;

      if (role === 'gm') {
        clearCampaignSyncRetry();
        handleIncomingCampaign(json, 'gm');
        return;
      }
      if (playerReceivedHostCampaign) {
        handleIncomingCampaign(json, 'player');
        return;
      }
      if (!isValidCampaignJson(json)) return;
      handleIncomingCampaign(json, 'player');
    },
    onMeta: (payload) => {
      handleIncomingMeta(payload);
    },
    onAsset: (data, metadata, _peerId) => {
      const campaignId = params.campaignId;
      void handleRemoteAsset(data, metadata, campaignId);
    },
  };
}

async function connectSession(
  params: ConnectParams,
  options?: { fromReconnect?: boolean },
): Promise<void> {
  if (!options?.fromReconnect) {
    stopReconnectLoop();
  }

  if (!hasRequiredCryptoContext()) {
    useStore.getState().setSyncStatus('error');
    return;
  }

  suppressReconnect = true;
  await teardownSession();
  suppressReconnect = false;
  hadPeersWhileConnected = false;

  useStore.getState().setSyncStatus('connecting');
  useStore.getState().setRoomCode(params.roomCode);
  useStore.getState().setRole(params.role);
  useStore.getState().setPlayerName(params.playerName);

  saveSession({
    roomCode: params.roomCode,
    role: params.role,
    playerName: params.playerName,
    campaignId: params.campaignId,
  });

  currentConnectParams = params;
  const joined = await joinNamedRoom(params.roomCode, wireRoomHandlers(params));
  if (!joined) {
    useStore.getState().setSyncStatus('error');
    return;
  }

  sessionActive = true;
  wireStoreSync(params.role);
  startRemoteMotion();

  if (params.role === 'gm') {
    unsubscribeAssetSync = wireGmAssetSync();
    useStore.getState().setSyncStatus('connected');
    useStore.getState().setPeerCount(getConnectedPeerCount());
  } else {
    useStore.getState().setPeerCount(getConnectedPeerCount());
    void hydrateAssetsForCampaign(useStore.getState().campaign);
    unsubscribeAssetSync = useStore.subscribe((state, prev) => {
      if (state.role !== 'player') return;
      if (state.campaign !== prev.campaign) {
        void hydrateAssetsForCampaign(state.campaign);
      }
    });
  }
}

function campaignIdOrThrow(): string {
  const id = useStore.getState().campaign?.id;
  if (!id) throw new Error('Campaign not loaded');
  return id;
}

function beginGmHost(roomCode: string): void {
  void (async () => {
    pendingCampaign = null;
    playerReceivedHostCampaign = false;
    await connectSession({
      roomCode: roomCode.trim().toUpperCase(),
      role: 'gm',
      playerName: useStore.getState().playerName,
      campaignId: campaignIdOrThrow(),
    });
  })();
}

function beginPlayerJoin(roomCode: string, playerName: string): void {
  void (async () => {
    pendingCampaign = null;
    playerReceivedHostCampaign = false;
    useStore.getState().setPlayerName(playerName.trim());
    await connectSession({
      roomCode: roomCode.trim().toUpperCase(),
      role: 'player',
      playerName: playerName.trim(),
      campaignId: campaignIdOrThrow(),
    });
  })();
}

export function hostRoom(roomCode: string): void {
  beginGmHost(roomCode);
}

export async function joinRoom(
  roomCode: string,
  playerName: string,
  _options?: { skipHostProbe?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = roomCode.trim().toUpperCase();
  const name = playerName.trim();
  if (!code || !name) {
    return { ok: false, error: 'Name and room code are required.' };
  }

  beginPlayerJoin(code, name);
  return { ok: true };
}

export function tryRestoreSession(campaignId: string): boolean {
  if (sessionActive) return false;

  const session = loadSession(campaignId);
  if (!session) return false;

  void connectSession({
    roomCode: session.roomCode,
    role: session.role,
    playerName: session.playerName,
    campaignId: session.campaignId,
  });
  return true;
}

export function pushSceneToPlayers(): void {
  if (!sessionActive || useStore.getState().role !== 'gm') return;
  publishCurrentMeta();
}

export function canEditToken(token: {
  owner: 'gm' | 'player';
  lockedForPlayers?: boolean;
}): boolean {
  const { role, playerView } = useStore.getState();
  if (role === 'gm' && !playerView) return true;
  return !isTokenLockedForPlayers(token);
}

export {
  canSessionInitiateMovement,
  canSessionMoveDrawStrokes,
  canSessionMoveToken,
} from './peerSelection';

export function canMoveToken(token: {
  id: string;
  owner: 'gm' | 'player';
  lockedForPlayers?: boolean;
}): boolean {
  return canEditToken(token) && canSessionMoveToken(token.id);
}

export function canEditFog(): boolean {
  const { role, playerView } = useStore.getState();
  return role === 'gm' && !playerView;
}
