import { newId } from '../ids';
import type { Campaign } from '../types';
import { applyPatchesToCampaign, getObjectSnapshot } from './applyPatch';
import {
  computeCoalesceKey,
  tryCoalesceHistoryEntry,
} from './coalesce';
import { deepEqual } from './equal';
import { patchTouchesRef, serializeObjectRef } from './refs';
import type { EditHistoryState, HistoryEntry, ObjectPatch } from './types';
import { MAX_HISTORY_ENTRIES } from './types';

export function isHistorySuppressed(state: EditHistoryState): boolean {
  return state.historySuppressDepth > 0;
}

export function purgeObjectFromStacks(
  refKey: string,
  undoStack: HistoryEntry[],
  redoStack: HistoryEntry[],
): { undoStack: HistoryEntry[]; redoStack: HistoryEntry[] } {
  const filterEntry = (entry: HistoryEntry): HistoryEntry | null => {
    const remaining = entry.patches.filter((p) => !patchTouchesRef(p.ref, refKey));
    if (remaining.length === 0) return null;
    if (remaining.length === entry.patches.length) return entry;
    return { ...entry, patches: remaining };
  };

  return {
    undoStack: undoStack.map(filterEntry).filter((e): e is HistoryEntry => e != null),
    redoStack: redoStack.map(filterEntry).filter((e): e is HistoryEntry => e != null),
  };
}

export function pushHistoryEntry(
  state: EditHistoryState,
  patches: ObjectPatch[],
  label?: string,
): EditHistoryState {
  if (patches.length === 0 || isHistorySuppressed(state)) return state;

  const now = Date.now();
  const { undoStack: coalescedStack, coalesced } = tryCoalesceHistoryEntry(
    state.undoStack,
    patches,
    label,
    now,
  );

  if (coalesced) {
    return {
      ...state,
      undoStack: coalescedStack,
      redoStack: [],
    };
  }

  const entry: HistoryEntry = {
    id: newId(),
    label,
    timestamp: now,
    patches,
    coalesceKey: computeCoalesceKey(patches),
  };
  let undoStack = [...coalescedStack, entry];
  if (undoStack.length > MAX_HISTORY_ENTRIES) {
    undoStack = undoStack.slice(undoStack.length - MAX_HISTORY_ENTRIES);
  }
  return {
    ...state,
    undoStack,
    redoStack: [],
  };
}

type StepResult = {
  campaign: Campaign;
  appliedPatches: ObjectPatch[];
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  refKeysPurged: string[];
};

function stepHistory(
  campaign: Campaign,
  entry: HistoryEntry,
  direction: 'undo' | 'redo',
  undoStack: HistoryEntry[],
  redoStack: HistoryEntry[],
): StepResult {
  const appliedPatches: ObjectPatch[] = [];
  const refKeysPurged: string[] = [];
  let nextUndo = undoStack;
  let nextRedo = redoStack;

  const applyList: { ref: ObjectPatch['ref']; snapshot: ObjectPatch['before'] | ObjectPatch['after'] }[] =
    [];

  for (const patch of entry.patches) {
    const current = getObjectSnapshot(campaign, patch.ref);
    const expected = direction === 'undo' ? patch.after : patch.before;

    if (current === undefined) {
      const refKey = serializeObjectRef(patch.ref);
      refKeysPurged.push(refKey);
      const purged = purgeObjectFromStacks(refKey, nextUndo, nextRedo);
      nextUndo = purged.undoStack;
      nextRedo = purged.redoStack;
      continue;
    }

    if (!deepEqual(current, expected)) {
      const refKey = serializeObjectRef(patch.ref);
      refKeysPurged.push(refKey);
      const purged = purgeObjectFromStacks(refKey, nextUndo, nextRedo);
      nextUndo = purged.undoStack;
      nextRedo = purged.redoStack;
      continue;
    }

    const target = direction === 'undo' ? patch.before : patch.after;
    applyList.push({ ref: patch.ref, snapshot: target });
    appliedPatches.push(patch);
  }

  let nextCampaign = campaign;
  if (applyList.length > 0) {
    nextCampaign = applyPatchesToCampaign(campaign, applyList);
  }

  return {
    campaign: nextCampaign,
    appliedPatches,
    undoStack: nextUndo,
    redoStack: nextRedo,
    refKeysPurged,
  };
}

export function performUndo(
  campaign: Campaign,
  state: EditHistoryState,
): { campaign: Campaign; state: EditHistoryState } | null {
  if (state.undoStack.length === 0) return null;
  const entry = state.undoStack[state.undoStack.length - 1]!;
  const remainingUndo = state.undoStack.slice(0, -1);

  const result = stepHistory(campaign, entry, 'undo', remainingUndo, state.redoStack);

  const redoEntry: HistoryEntry | null =
    result.appliedPatches.length > 0
      ? { ...entry, patches: result.appliedPatches }
      : null;

  return {
    campaign: result.campaign,
    state: {
      ...state,
      undoStack: result.undoStack,
      redoStack: redoEntry ? [...result.redoStack, redoEntry] : result.redoStack,
    },
  };
}

export function performRedo(
  campaign: Campaign,
  state: EditHistoryState,
): { campaign: Campaign; state: EditHistoryState } | null {
  if (state.redoStack.length === 0) return null;
  const entry = state.redoStack[state.redoStack.length - 1]!;
  const remainingRedo = state.redoStack.slice(0, -1);

  const result = stepHistory(campaign, entry, 'redo', state.undoStack, remainingRedo);

  const undoEntry: HistoryEntry | null =
    result.appliedPatches.length > 0
      ? { ...entry, patches: result.appliedPatches }
      : null;

  return {
    campaign: result.campaign,
    state: {
      ...state,
      undoStack: undoEntry ? [...result.undoStack, undoEntry] : result.undoStack,
      redoStack: result.redoStack,
    },
  };
}

export function createInitialHistoryState(): EditHistoryState {
  return {
    undoStack: [],
    redoStack: [],
    historySuppressDepth: 0,
  };
}
