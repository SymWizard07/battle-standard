import { isTokenLockedForPlayers } from '../lib/tokenVisibility';
import type {
  Campaign,
  DrawStroke,
  MeasurementObject,
  Scene,
  SessionRole,
  Token,
} from '../lib/types';

type MergeOptions = {
  preserveLocalUnlockedGmTokens?: boolean;
  localUpdatedAt?: number;
  remoteUpdatedAt?: number;
};

function mergeTokenLists(
  local: Token[],
  remote: Token[],
  role: SessionRole,
  options?: MergeOptions,
): Token[] {
  const remoteById = new Map(remote.map((t) => [t.id, t]));

  if (role === 'gm') {
    const byId = new Map(local.map((t) => [t.id, t]));
    for (const token of remote) {
      const localToken = byId.get(token.id);
      if (token.owner === 'player') {
        byId.set(token.id, token);
        continue;
      }
      if (localToken && isTokenLockedForPlayers(localToken)) continue;
      if (!isTokenLockedForPlayers(token)) {
        byId.set(token.id, token);
      }
    }
    for (const id of [...byId.keys()]) {
      const token = byId.get(id)!;
      if (token.owner === 'player' && !remoteById.has(id)) {
        byId.delete(id);
      }
    }
    return [...byId.values()];
  }

  const byId = new Map(remote.map((t) => [t.id, t]));
  for (const token of local) {
    if (!byId.has(token.id)) continue;
    if (token.owner === 'player') {
      byId.set(token.id, token);
      continue;
    }
    if (
      options?.preserveLocalUnlockedGmTokens &&
      token.owner === 'gm' &&
      !isTokenLockedForPlayers(token) &&
      (options.localUpdatedAt ?? 0) >= (options.remoteUpdatedAt ?? 0)
    ) {
      const remoteToken = byId.get(token.id)!;
      if (!isTokenLockedForPlayers(remoteToken)) {
        byId.set(token.id, token);
      }
    }
  }
  return [...byId.values()];
}

function isPlayerDrawStroke(stroke: DrawStroke): boolean {
  return stroke.createdBy?.role === 'player';
}

function mergeDrawStrokes(
  local: DrawStroke[],
  remote: DrawStroke[],
  role: SessionRole,
  options?: MergeOptions,
): DrawStroke[] {
  const remoteById = new Map(remote.map((stroke) => [stroke.id, stroke]));

  if (role === 'gm') {
    const byId = new Map(local.map((stroke) => [stroke.id, stroke]));
    const order = local.map((stroke) => stroke.id);

    for (const stroke of remote) {
      if (isPlayerDrawStroke(stroke)) {
        if (!byId.has(stroke.id)) order.push(stroke.id);
        byId.set(stroke.id, stroke);
        continue;
      }
      if (!byId.has(stroke.id)) {
        byId.set(stroke.id, stroke);
        order.push(stroke.id);
      } else if ((options?.remoteUpdatedAt ?? 0) > (options?.localUpdatedAt ?? 0)) {
        byId.set(stroke.id, stroke);
      }
    }

    for (const id of [...byId.keys()]) {
      const stroke = byId.get(id)!;
      if (isPlayerDrawStroke(stroke) && !remoteById.has(id)) {
        byId.delete(id);
        const idx = order.indexOf(id);
        if (idx >= 0) order.splice(idx, 1);
      }
    }

    return order.map((id) => byId.get(id)!).filter(Boolean);
  }

  const byId = new Map(remote.map((stroke) => [stroke.id, stroke]));
  const order = remote.map((stroke) => stroke.id);

  for (const stroke of local) {
    if (!isPlayerDrawStroke(stroke)) continue;
    if (!byId.has(stroke.id)) {
      byId.set(stroke.id, stroke);
      order.push(stroke.id);
      continue;
    }
    if (
      options?.preserveLocalUnlockedGmTokens &&
      (options.localUpdatedAt ?? 0) >= (options.remoteUpdatedAt ?? 0)
    ) {
      byId.set(stroke.id, stroke);
    }
  }

  return order.map((id) => byId.get(id)!).filter(Boolean);
}

function mergeMeasurements(
  local: MeasurementObject[],
  remote: MeasurementObject[],
  role: SessionRole,
  options?: MergeOptions,
): MeasurementObject[] {
  const remoteById = new Map(remote.map((m) => [m.id, m]));

  if (role === 'gm') {
    const byId = new Map(local.map((m) => [m.id, m]));
    for (const m of remote) {
      if (m.pinnedBy?.role === 'player') {
        byId.set(m.id, m);
        continue;
      }
      if (!byId.has(m.id)) {
        byId.set(m.id, m);
      } else if ((options?.remoteUpdatedAt ?? 0) > (options?.localUpdatedAt ?? 0)) {
        byId.set(m.id, m);
      }
    }
    for (const id of [...byId.keys()]) {
      const m = byId.get(id)!;
      if (m.pinnedBy?.role === 'player' && !remoteById.has(id)) {
        byId.delete(id);
      }
    }
    return [...byId.values()];
  }

  const byId = new Map(remote.map((m) => [m.id, m]));
  for (const m of local) {
    if (m.pinnedBy?.role !== 'player') continue;
    if (!byId.has(m.id)) {
      byId.set(m.id, m);
      continue;
    }
    if (
      options?.preserveLocalUnlockedGmTokens &&
      (options.localUpdatedAt ?? 0) >= (options.remoteUpdatedAt ?? 0)
    ) {
      byId.set(m.id, m);
    }
  }
  return [...byId.values()];
}

function mergeScenes(
  local: Scene,
  remote: Scene,
  role: SessionRole,
  options?: MergeOptions,
): Scene {
  const tokens = mergeTokenLists(local.tokens, remote.tokens, role, options);
  const drawStrokes = mergeDrawStrokes(
    local.drawStrokes ?? [],
    remote.drawStrokes ?? [],
    role,
    options,
  );
  const measurements = mergeMeasurements(
    local.measurements,
    remote.measurements,
    role,
    options,
  );
  const base = role === 'gm' ? local : remote;
  return { ...base, tokens, drawStrokes, measurements };
}

/** Merge a remote campaign snapshot into local state without clobbering role-owned edits. */
export function mergeCampaignForSync(
  local: Campaign,
  remote: Campaign,
  role: SessionRole,
  options?: MergeOptions,
): Campaign {
  const sceneIds = new Set([
    ...Object.keys(local.scenes),
    ...Object.keys(remote.scenes),
  ]);
  const scenes: Record<string, Scene> = {};

  for (const sceneId of sceneIds) {
    const localScene = local.scenes[sceneId];
    const remoteScene = remote.scenes[sceneId];
    if (localScene && remoteScene) {
      scenes[sceneId] = mergeScenes(localScene, remoteScene, role, options);
      continue;
    }
    if (role === 'gm') {
      if (localScene) scenes[sceneId] = localScene;
      else if (remoteScene) scenes[sceneId] = remoteScene;
    } else if (remoteScene) {
      scenes[sceneId] = remoteScene;
    } else if (localScene) {
      scenes[sceneId] = localScene;
    }
  }

  if (role === 'gm') {
    return {
      ...local,
      scenes,
      lastActiveSceneId: remote.lastActiveSceneId ?? local.lastActiveSceneId,
    };
  }

  return {
    ...remote,
    scenes,
    lastActiveSceneId: remote.lastActiveSceneId ?? local.lastActiveSceneId,
  };
}
