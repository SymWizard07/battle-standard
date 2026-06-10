import { deepEqual } from './equal';
import { serializeObjectRef } from './refs';
import type { HistoryEntry, ObjectPatch } from './types';

/** Time window for merging consecutive edits of the same operation kind. */
export const HISTORY_COALESCE_DEBOUNCE_MS = 2000;

const CAMPAIGN_KINDS = new Set<ObjectPatch['ref']['kind']>([
  'scene',
  'sceneDeck',
  'tokenLibrary',
]);

/** Groups patches so similar consecutive edits can merge into one undo step. */
export function computeCoalesceKey(patches: ObjectPatch[]): string {
  if (patches.length === 0) return 'empty';

  const kinds = new Set(patches.map((p) => p.ref.kind));
  if ([...kinds].some((k) => CAMPAIGN_KINDS.has(k))) {
    return [...kinds].sort().join('+');
  }

  const sceneIds = new Set(
    patches.map((p) => p.ref.sceneId).filter((id): id is string => Boolean(id)),
  );
  if (sceneIds.size === 0) return 'unknown';
  if (sceneIds.size > 1) return 'multi-scene';

  const sceneId = [...sceneIds][0]!;
  const kindList = [...kinds].sort();
  if (kindList.length === 1) return `${kindList[0]}:${sceneId}`;
  return `scene-edit:${sceneId}`;
}

/** Merge incoming patches into an existing entry, keeping the earliest `before`. */
export function mergeCoalescedPatches(
  existing: ObjectPatch[],
  incoming: ObjectPatch[],
): ObjectPatch[] {
  const byRef = new Map<string, ObjectPatch>();
  for (const patch of existing) {
    byRef.set(serializeObjectRef(patch.ref), { ...patch });
  }

  for (const patch of incoming) {
    const key = serializeObjectRef(patch.ref);
    const prev = byRef.get(key);
    if (!prev) {
      byRef.set(key, { ...patch });
      continue;
    }
    byRef.set(key, {
      ref: patch.ref,
      before: prev.before,
      after: patch.after,
    });
  }

  return [...byRef.values()].filter((p) => !deepEqual(p.before, p.after));
}

export function tryCoalesceHistoryEntry(
  undoStack: HistoryEntry[],
  incoming: ObjectPatch[],
  label: string | undefined,
  now: number,
): { undoStack: HistoryEntry[]; coalesced: boolean } {
  if (undoStack.length === 0 || incoming.length === 0) {
    return { undoStack, coalesced: false };
  }

  const top = undoStack[undoStack.length - 1]!;
  const incomingKey = computeCoalesceKey(incoming);
  const topKey = top.coalesceKey ?? computeCoalesceKey(top.patches);

  if (incomingKey !== topKey) return { undoStack, coalesced: false };
  if (now - top.timestamp > HISTORY_COALESCE_DEBOUNCE_MS) {
    return { undoStack, coalesced: false };
  }

  const mergedPatches = mergeCoalescedPatches(top.patches, incoming);
  if (mergedPatches.length === 0) {
    return { undoStack: undoStack.slice(0, -1), coalesced: true };
  }

  const merged: HistoryEntry = {
    ...top,
    label: top.label ?? label,
    patches: mergedPatches,
    coalesceKey: topKey,
  };
  return {
    undoStack: [...undoStack.slice(0, -1), merged],
    coalesced: true,
  };
}
