import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { isTokenLockedForPlayers } from '../lib/tokenVisibility';
import type { Campaign, SceneId, SessionRole } from '../lib/types';
import { deepEqual } from '../lib/history/equal';
import { useStore } from '../store/useStore';
import { wireAssetSync } from './assetSync';
import { mergeCampaignForSync } from './campaignMerge';
import { probeRoomHosted, SIGNALING, docHasGmHostData } from './roomProbe';
import {
  clearSession,
  isSessionValid,
  loadSession,
  refreshSessionExpiry,
  saveSession,
} from './sessionReconnect';

const RECONNECT_INTERVAL_MS = 2000;
const PEER_LOSS_DEBOUNCE_MS = 2000;
const PLAYER_JOIN_TIMEOUT_MS = 8000;

let doc: Y.Doc | null = null;
let provider: WebrtcProvider | null = null;
let unsubscribeStore: (() => void) | null = null;
let unsubscribeAssetSync: (() => void) | null = null;
let reconnectTimer: ReturnType<typeof setInterval> | null = null;
let peerLossTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalDisconnect = false;
let suppressReconnect = false;
let hadPeersWhileConnected = false;
let playerJoinResolve: ((ok: boolean) => void) | null = null;
let playerJoinWatchCleanup: (() => void) | null = null;

type ConnectParams = {
  roomCode: string;
  role: SessionRole;
  playerName: string;
  campaignId: string;
};

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

function clearPlayerJoinWatch(): void {
  playerJoinWatchCleanup?.();
  playerJoinWatchCleanup = null;
}

function resolvePlayerJoin(ok: boolean): void {
  if (!playerJoinResolve) return;
  const resolve = playerJoinResolve;
  playerJoinResolve = null;
  clearPlayerJoinWatch();
  if (ok) {
    refreshSessionExpiry();
    stopReconnectLoop();
    useStore.getState().setSyncStatus('connected');
  }
  resolve(ok);
}

function playerHasHostData(activeDoc: Y.Doc): boolean {
  return docHasGmHostData(activeDoc);
}

function startPlayerJoinWatch(activeDoc: Y.Doc): void {
  clearPlayerJoinWatch();
  if (playerHasHostData(activeDoc)) {
    resolvePlayerJoin(true);
    return;
  }

  const campaignMap = activeDoc.getMap('campaign');
  const metaMap = activeDoc.getMap('meta');
  const onData = () => {
    if (playerHasHostData(activeDoc)) resolvePlayerJoin(true);
  };

  campaignMap.observe(onData);
  metaMap.observe(onData);
  const unsubPeers = useStore.subscribe((state, prev) => {
    if (state.peerCount > 0 && prev.peerCount !== state.peerCount) {
      if (playerHasHostData(activeDoc)) resolvePlayerJoin(true);
    }
  });

  playerJoinWatchCleanup = () => {
    campaignMap.unobserve(onData);
    metaMap.unobserve(onData);
    unsubPeers();
  };
}

function teardownProvider(): void {
  clearPlayerJoinWatch();
  unsubscribeStore?.();
  unsubscribeStore = null;
  unsubscribeAssetSync?.();
  unsubscribeAssetSync = null;
  provider?.destroy();
  provider = null;
  doc?.destroy();
  doc = null;
}

export function disconnectSync(options?: { intentional?: boolean }): void {
  const intentional = options?.intentional ?? true;
  intentionalDisconnect = intentional;
  suppressReconnect = true;
  stopReconnectLoop();
  teardownProvider();

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
    connectSession(
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

function handleStatus(connected: boolean): void {
  if (connected) {
    refreshSessionExpiry();
    stopReconnectLoop();
    if (!playerJoinResolve) {
      useStore.getState().setSyncStatus('connected');
    }
    return;
  }

  if (suppressReconnect || intentionalDisconnect) return;
  useStore.getState().setSyncStatus('connecting');
  startReconnectLoop();
}

function handlePeers(event: { webrtcPeers: unknown[]; bcPeers: unknown[] }): void {
  const count = event.webrtcPeers.length + event.bcPeers.length;
  const state = useStore.getState();
  useStore.getState().setPeerCount(count);

  if (state.syncStatus === 'connected' && count > 0) {
    hadPeersWhileConnected = true;
  }

  if (count > 0 && useStore.getState().reconnecting) {
    stopReconnectLoop();
  }

  if (
    state.role === 'player' &&
    hadPeersWhileConnected &&
    count === 0 &&
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

type SyncSession = {
  applyingRemote: boolean;
};

function applyRemoteCampaign(
  json: string,
  role: SessionRole,
  session: SyncSession,
): void {
  try {
    const remote = JSON.parse(json) as Campaign;
    const local = useStore.getState().campaign;
    const next =
      local != null ? mergeCampaignForSync(local, remote, role) : remote;
    if (local != null && deepEqual(local, next)) return;
    session.applyingRemote = true;
    useStore.getState().setCampaignRemote(next);
  } catch {
    useStore.getState().setSyncStatus('error');
  } finally {
    session.applyingRemote = false;
  }
}

function wireCampaignSync(
  campaignMap: Y.Map<unknown>,
  metaMap: Y.Map<unknown>,
  role: SessionRole,
): void {
  const session: SyncSession = { applyingRemote: false };

  if (role === 'gm') {
    const local = useStore.getState().campaign;
    if (local) {
      campaignMap.set('json', JSON.stringify(local));
      metaMap.set('activeSceneId', useStore.getState().activeSceneId ?? '');
      metaMap.set('host', useStore.getState().playerName);
    }
  }

  campaignMap.observe(() => {
    if (session.applyingRemote) return;
    const json = campaignMap.get('json') as string | undefined;
    if (!json) return;
    applyRemoteCampaign(json, role, session);
  });

  metaMap.observe(() => {
    const active = metaMap.get('activeSceneId') as string | undefined;
    if (!active || role !== 'player') return;
    useStore.getState().setActiveScene(active as SceneId);
  });

  unsubscribeStore = useStore.subscribe((state, prev) => {
    if (session.applyingRemote || state.role !== role || !doc) return;
    if (state.campaign !== prev.campaign && state.campaign) {
      campaignMap.set('json', JSON.stringify(state.campaign));
    }
    if (role === 'gm' && state.activeSceneId !== prev.activeSceneId && state.activeSceneId) {
      metaMap.set('activeSceneId', state.activeSceneId);
    }
  });
}

function connectSession(params: ConnectParams, options?: { fromReconnect?: boolean }): void {
  if (!options?.fromReconnect) {
    stopReconnectLoop();
  }

  suppressReconnect = true;
  teardownProvider();
  suppressReconnect = false;
  hadPeersWhileConnected = false;

  doc = new Y.Doc();
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

  provider = new WebrtcProvider(params.roomCode, doc, {
    signaling: SIGNALING,
    maxConns: 20,
  });

  const campaignMap = doc.getMap('campaign');
  const metaMap = doc.getMap('meta');

  provider.on('status', (event: { connected: boolean }) => {
    handleStatus(event.connected);
  });

  provider.on('peers', handlePeers);

  wireCampaignSync(campaignMap, metaMap, params.role);
  unsubscribeAssetSync = wireAssetSync(doc, params.role, params.campaignId);

  if (params.role === 'player' && playerJoinResolve && doc) {
    startPlayerJoinWatch(doc);
  }
}

function campaignIdOrThrow(): string {
  const id = useStore.getState().campaign?.id;
  if (!id) throw new Error('Campaign not loaded');
  return id;
}

export function hostRoom(roomCode: string): void {
  connectSession({
    roomCode,
    role: 'gm',
    playerName: useStore.getState().playerName,
    campaignId: campaignIdOrThrow(),
  });
}

export async function joinRoom(
  roomCode: string,
  playerName: string,
  options?: { skipHostProbe?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = roomCode.trim().toUpperCase();
  const name = playerName.trim();
  if (!code || !name) {
    return { ok: false, error: 'Name and room code are required.' };
  }

  let probeResult: boolean | 'skipped' = 'skipped';
  if (!options?.skipHostProbe) {
    probeResult = await probeRoomHosted(code);
    if (!probeResult) {
      return { ok: false, error: 'No hosted session found for that room code.' };
    }
  }

  const validation = new Promise<boolean>((resolve) => {
    playerJoinResolve = resolve;
  });

  connectSession({
    roomCode: code,
    role: 'player',
    playerName: name,
    campaignId: campaignIdOrThrow(),
  });

  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), PLAYER_JOIN_TIMEOUT_MS);
  });

  const ok = await Promise.race([validation, timeout]);

  if (playerJoinResolve) {
    playerJoinResolve = null;
    clearPlayerJoinWatch();
  }

  if (!ok) {
    disconnectSync({ intentional: true });
    return { ok: false, error: 'Could not connect to the session. The host may have left.' };
  }

  return { ok: true };
}

export function tryRestoreSession(campaignId: string): boolean {
  if (provider) return false;

  const session = loadSession(campaignId);
  if (!session) return false;

  connectSession({
    roomCode: session.roomCode,
    role: session.role,
    playerName: session.playerName,
    campaignId: session.campaignId,
  });
  return true;
}

export function pushSceneToPlayers(): void {
  if (!doc || useStore.getState().role !== 'gm') return;
  const metaMap = doc.getMap('meta');
  const id = useStore.getState().activeSceneId;
  if (id) metaMap.set('activeSceneId', id);
}

export function canEditToken(token: {
  owner: 'gm' | 'player';
  lockedForPlayers?: boolean;
}): boolean {
  const { role, playerView } = useStore.getState();
  if (role === 'gm' && !playerView) return true;
  return !isTokenLockedForPlayers(token);
}

export function canEditFog(): boolean {
  const { role, playerView } = useStore.getState();
  return role === 'gm' && !playerView;
}
