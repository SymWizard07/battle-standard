import { sceneMaps } from '../sceneMaps';
import type { Scene } from '../types';
import { cloneSnapshot, deepEqual } from './equal';
import type { ObjectPatch, SceneMetaSnapshot } from './types';

function diffById<T extends { id: string }>(
  kind: ObjectPatch['ref']['kind'],
  sceneId: string,
  before: T[],
  after: T[],
): ObjectPatch[] {
  const patches: ObjectPatch[] = [];
  const beforeMap = new Map(before.map((item) => [item.id, item]));
  const afterMap = new Map(after.map((item) => [item.id, item]));

  for (const [id, afterItem] of afterMap) {
    const beforeItem = beforeMap.get(id);
    if (!beforeItem) {
      patches.push({
        ref: { kind, sceneId, id },
        before: null,
        after: cloneSnapshot(afterItem) as unknown as ObjectPatch['after'],
      });
    } else if (!deepEqual(beforeItem, afterItem)) {
      patches.push({
        ref: { kind, sceneId, id },
        before: cloneSnapshot(beforeItem) as unknown as ObjectPatch['before'],
        after: cloneSnapshot(afterItem) as unknown as ObjectPatch['after'],
      });
    }
  }

  for (const [id, beforeItem] of beforeMap) {
    if (!afterMap.has(id)) {
      patches.push({
        ref: { kind, sceneId, id },
        before: cloneSnapshot(beforeItem) as unknown as ObjectPatch['before'],
        after: null,
      });
    }
  }

  return patches;
}

function sceneMetaSnapshot(scene: Scene): SceneMetaSnapshot {
  return {
    name: scene.name,
    gridOffset: scene.gridOffset ?? { x: 0, y: 0 },
  };
}

export function diffScene(sceneId: string, before: Scene, after: Scene): ObjectPatch[] {
  const patches: ObjectPatch[] = [];

  patches.push(
    ...diffById('token', sceneId, before.tokens, after.tokens),
    ...diffById('measurement', sceneId, before.measurements, after.measurements),
    ...diffById('drawStroke', sceneId, before.drawStrokes ?? [], after.drawStrokes ?? []),
    ...diffById('mapLayer', sceneId, sceneMaps(before), sceneMaps(after)),
  );

  if (!deepEqual(before.fog, after.fog)) {
    patches.push({
      ref: { kind: 'fog', sceneId, id: 'fog' },
      before: cloneSnapshot(before.fog),
      after: cloneSnapshot(after.fog),
    });
  }

  const beforeMeta = sceneMetaSnapshot(before);
  const afterMeta = sceneMetaSnapshot(after);
  if (!deepEqual(beforeMeta, afterMeta)) {
    patches.push({
      ref: { kind: 'sceneMeta', sceneId, id: 'meta' },
      before: cloneSnapshot(beforeMeta),
      after: cloneSnapshot(afterMeta),
    });
  }

  return patches;
}
