import { defaultPlayerColor } from '../lib/playerColor';
import type { SceneId, SessionRole } from '../lib/types';
import { useStore } from '../store/useStore';
import { selfId } from '@trystero-p2p/mqtt';

export type SelectionPayload = {
  role: SessionRole;
  playerName: string;
  sessionColor: string;
  sceneId: SceneId;
  selectedTokenIds: string[];
  selectedDrawStrokeIds: string[];
  selectedMeasurementId: string | null;
};

export type PeerSelectionState = SelectionPayload & {
  peerId: string;
};

const peerSelections = new Map<string, PeerSelectionState>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function selectionPayloadFromStore(): SelectionPayload {
  const state = useStore.getState();
  return {
    role: state.role,
    playerName: state.playerName,
    sessionColor: defaultPlayerColor(state.playerName, state.drawHue ?? 0),
    sceneId: state.activeSceneId ?? '',
    selectedTokenIds: state.selectedTokenIds,
    selectedDrawStrokeIds: state.selectedDrawStrokeIds,
    selectedMeasurementId: state.selectedMeasurementId,
  };
}

export function peerHasActiveSelection(peer: PeerSelectionState): boolean {
  return (
    peer.selectedTokenIds.length > 0 ||
    peer.selectedDrawStrokeIds.length > 0 ||
    peer.selectedMeasurementId != null
  );
}

export function setPeerSelection(peerId: string, payload: SelectionPayload): void {
  peerSelections.set(peerId, { peerId, ...payload });
  notify();
}

export function removePeerSelection(peerId: string): void {
  if (!peerSelections.delete(peerId)) return;
  notify();
}

export function clearPeerSelections(): void {
  if (peerSelections.size === 0) return;
  peerSelections.clear();
  notify();
}

export function getPeerSelections(): PeerSelectionState[] {
  return [...peerSelections.values()];
}

export function subscribePeerSelections(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function peersOnScene(sceneId: SceneId | null | undefined): PeerSelectionState[] {
  if (!sceneId) return [];
  return getPeerSelections().filter((peer) => peer.sceneId === sceneId);
}

export function gmHasSelectionOnScene(sceneId: SceneId | null | undefined): boolean {
  return peersOnScene(sceneId).some(
    (peer) => peer.role === 'gm' && peerHasActiveSelection(peer),
  );
}

function lockingPeerForObject(
  sceneId: SceneId,
  type: 'token' | 'draw' | 'measurement',
  id: string,
): PeerSelectionState | null {
  for (const peer of peersOnScene(sceneId)) {
    if (peer.peerId === selfId) continue;
    if (type === 'token' && peer.selectedTokenIds.includes(id)) return peer;
    if (type === 'draw' && peer.selectedDrawStrokeIds.includes(id)) return peer;
    if (type === 'measurement' && peer.selectedMeasurementId === id) return peer;
  }
  return null;
}

/** Players may not move anything while the GM has an active selection. GM is never blocked. */
export function canSessionInitiateMovement(): boolean {
  const { role, playerView, activeSceneId } = useStore.getState();
  if (role === 'gm' && !playerView) return true;
  return !gmHasSelectionOnScene(activeSceneId);
}

export function canSessionMoveToken(tokenId: string): boolean {
  if (!canSessionInitiateMovement()) return false;
  const { role, playerView, activeSceneId } = useStore.getState();
  if (role === 'gm' && !playerView) return true;
  if (!activeSceneId) return true;
  return lockingPeerForObject(activeSceneId, 'token', tokenId) == null;
}

export function canSessionMoveDrawStrokes(strokeIds: string[]): boolean {
  if (!canSessionInitiateMovement()) return false;
  if (strokeIds.length === 0) return true;
  const { role, playerView, activeSceneId } = useStore.getState();
  if (role === 'gm' && !playerView) return true;
  if (!activeSceneId) return true;
  return strokeIds.every(
    (id) => lockingPeerForObject(activeSceneId, 'draw', id) == null,
  );
}

export function getPeerTokenSelectionColors(
  sceneId: SceneId | null | undefined,
): Map<string, string> {
  const colors = new Map<string, string>();
  if (!sceneId) return colors;
  for (const peer of peersOnScene(sceneId)) {
    if (peer.peerId === selfId) continue;
    for (const tokenId of peer.selectedTokenIds) {
      colors.set(tokenId, peer.sessionColor);
    }
  }
  return colors;
}

export function getPeerDrawSelections(
  sceneId: SceneId | null | undefined,
): PeerSelectionState[] {
  if (!sceneId) return [];
  return peersOnScene(sceneId).filter(
    (peer) => peer.peerId !== selfId && peer.selectedDrawStrokeIds.length > 0,
  );
}
