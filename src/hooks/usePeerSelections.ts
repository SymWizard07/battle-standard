import { useEffect, useState } from 'react';
import {
  getPeerDrawSelections,
  getPeerSelections,
  getPeerTokenSelectionColors,
  subscribePeerSelections,
  type PeerSelectionState,
} from '../sync/peerSelection';
import type { SceneId } from '../lib/types';

export function usePeerSelections(): PeerSelectionState[] {
  const [, setTick] = useState(0);
  useEffect(() => subscribePeerSelections(() => setTick((n) => n + 1)), []);
  return getPeerSelections();
}

export function usePeerTokenSelectionColors(sceneId: SceneId | null | undefined): Map<string, string> {
  const [, setTick] = useState(0);
  useEffect(() => subscribePeerSelections(() => setTick((n) => n + 1)), []);
  return getPeerTokenSelectionColors(sceneId);
}

export function usePeerDrawSelections(sceneId: SceneId | null | undefined): PeerSelectionState[] {
  const [, setTick] = useState(0);
  useEffect(() => subscribePeerSelections(() => setTick((n) => n + 1)), []);
  return getPeerDrawSelections(sceneId);
}
