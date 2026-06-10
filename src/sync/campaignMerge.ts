import { isTokenLockedForPlayers } from '../lib/tokenVisibility';
import type { Campaign, Scene, SessionRole, Token } from '../lib/types';

function mergeTokenLists(local: Token[], remote: Token[], role: SessionRole): Token[] {
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
    if (token.owner === 'player' && byId.has(token.id)) {
      byId.set(token.id, token);
    }
  }
  return [...byId.values()];
}

function mergeScenes(local: Scene, remote: Scene, role: SessionRole): Scene {
  const tokens = mergeTokenLists(local.tokens, remote.tokens, role);
  return role === 'gm' ? { ...local, tokens } : { ...remote, tokens };
}

/** Merge a remote campaign snapshot into local state without clobbering role-owned edits. */
export function mergeCampaignForSync(
  local: Campaign,
  remote: Campaign,
  role: SessionRole,
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
      scenes[sceneId] = mergeScenes(localScene, remoteScene, role);
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
