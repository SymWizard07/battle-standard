import type { Campaign, Scene } from '../types';
import { cloneSnapshot, deepEqual } from './equal';
import { diffScene } from './diffScene';
import type { ObjectPatch } from './types';

export function diffCampaign(before: Campaign, after: Campaign): ObjectPatch[] {
  const patches: ObjectPatch[] = [];

  const beforeSceneIds = new Set(Object.keys(before.scenes));
  const afterSceneIds = new Set(Object.keys(after.scenes));

  for (const sceneId of afterSceneIds) {
    const afterScene = after.scenes[sceneId]!;
    const beforeScene = before.scenes[sceneId];
    if (!beforeScene) {
      patches.push({
        ref: { kind: 'scene', id: sceneId },
        before: null,
        after: cloneSnapshot(afterScene),
      });
    } else {
      patches.push(...diffScene(sceneId, beforeScene, afterScene));
    }
  }

  for (const sceneId of beforeSceneIds) {
    if (!afterSceneIds.has(sceneId)) {
      patches.push({
        ref: { kind: 'scene', id: sceneId },
        before: cloneSnapshot(before.scenes[sceneId]!),
        after: null,
      });
    }
  }

  if (!deepEqual(before.sceneDeck, after.sceneDeck)) {
    patches.push({
      ref: { kind: 'sceneDeck', id: 'deck' },
      before: cloneSnapshot(before.sceneDeck),
      after: cloneSnapshot(after.sceneDeck),
    });
  }

  const beforeLib = before.tokenLibrary ?? null;
  const afterLib = after.tokenLibrary ?? null;
  if (!deepEqual(beforeLib, afterLib)) {
    patches.push({
      ref: { kind: 'tokenLibrary', id: 'library' },
      before: beforeLib ? cloneSnapshot(beforeLib) : null,
      after: afterLib ? cloneSnapshot(afterLib) : null,
    });
  }

  return patches;
}

export function diffCampaignScenesOnly(
  sceneId: string,
  beforeScene: Scene,
  afterScene: Scene,
): ObjectPatch[] {
  return diffScene(sceneId, beforeScene, afterScene);
}
