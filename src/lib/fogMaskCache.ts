import {
  appendFogOpsToMaskSet,
  createEmptyFogMaskSet,
  createFogMaskSet,
  fogOpsFingerprint,
  type FogMaskSet,
} from './fogMask';
import { isFogFullyClear, isFogFullyCovered } from './fog';
import type { FogOp, FogState, Scene } from './types';

type CacheEntry = {
  sceneId: string;
  fingerprint: string;
  defaultHidden: boolean;
  opCount: number;
  opIds: string[];
  set: FogMaskSet;
};

let entry: CacheEntry | null = null;

function isPrefixOps(prevIds: string[], ops: FogOp[]): boolean {
  if (ops.length < prevIds.length) return false;
  for (let i = 0; i < prevIds.length; i++) {
    if (ops[i]?.id !== prevIds[i]) return false;
  }
  return true;
}

export function getFogMaskSetForScene(scene: Scene, fog: FogState = scene.fog): FogMaskSet {
  if (isFogFullyClear(fog) || isFogFullyCovered(fog)) {
    return createEmptyFogMaskSet(!!fog.defaultHidden);
  }

  const fingerprint = fogOpsFingerprint(fog);

  if (
    entry &&
    entry.sceneId === scene.id &&
    entry.defaultHidden === !!fog.defaultHidden &&
    entry.fingerprint === fingerprint
  ) {
    return entry.set;
  }

  // Incremental: same scene/base and ops are a strict suffix of new ops.
  if (
    entry &&
    entry.sceneId === scene.id &&
    entry.defaultHidden === !!fog.defaultHidden &&
    isPrefixOps(entry.opIds, fog.ops) &&
    fog.ops.length > entry.opCount
  ) {
    const added = fog.ops.slice(entry.opCount);
    appendFogOpsToMaskSet(entry.set, added, { syncData: false });
    entry = {
      sceneId: scene.id,
      fingerprint,
      defaultHidden: !!fog.defaultHidden,
      opCount: fog.ops.length,
      opIds: fog.ops.map((o) => o.id),
      set: entry.set,
    };
    return entry.set;
  }

  const set = createFogMaskSet(fog);
  entry = {
    sceneId: scene.id,
    fingerprint,
    defaultHidden: !!fog.defaultHidden,
    opCount: fog.ops.length,
    opIds: fog.ops.map((o) => o.id),
    set,
  };
  return set;
}

/** @deprecated Prefer getFogMaskSetForScene. */
export function getFogMaskForScene(scene: Scene, fog: FogState = scene.fog): FogMaskSet {
  return getFogMaskSetForScene(scene, fog);
}

export function invalidateFogMaskCache() {
  entry = null;
}
