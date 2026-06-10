/**
 * Lightweight history tests runnable with: npm run test:history
 */
function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}
import { createScene, createCampaign } from '../campaignFactory';
import type { StatusEffectId, Token } from '../types';
import { diffScene } from './diffScene';
import { cloneSnapshot } from './equal';
import {
  createInitialHistoryState,
  performUndo,
  performRedo,
  pushHistoryEntry,
  isHistorySuppressed,
} from './EditHistory';
import { applyObjectSnapshot } from './applyPatch';
import type { ObjectPatch } from './types';

function makeToken(id: string, col: number): Token {
  return {
    id,
    name: id,
    gridPos: { col, row: 0 },
    footprint: { w: 1, h: 1 },
    rotation: 0,
    statusEffects: [] as StatusEffectId[],
    owner: 'gm',
    color: '#3b82f6',
  };
}

function testDiffSceneCreateToken() {
  const sceneId = 's1';
  const before = createScene('Test');
  const after = structuredClone(before);
  after.tokens.push({
    id: 't1',
    name: 'Goblin',
    gridPos: { col: 0, row: 0 },
    footprint: { w: 1, h: 1 },
    rotation: 0,
    statusEffects: [],
    owner: 'gm',
    color: '#3b82f6',
  });
  const patches = diffScene(sceneId, before, after);
  assertEqual(patches.length, 1);
  assertEqual(patches[0]!.ref.kind, 'token');
  assertEqual(patches[0]!.before, null);
  assertEqual((patches[0]!.after as Token).id, 't1');
}

function testDiffSceneMultiTokenUpdate() {
  const sceneId = 's1';
  const before = createScene('Test');
  before.tokens = [makeToken('a', 0), makeToken('b', 1)];
  const after = structuredClone(before);
  after.tokens[0]!.gridPos = { col: 2, row: 0 };
  after.tokens[1]!.gridPos = { col: 3, row: 0 };
  const patches = diffScene(sceneId, before, after);
  assertEqual(patches.length, 2);
}

function testUndoFullMatch() {
  const campaign = createCampaign('C');
  const sceneId = Object.keys(campaign.scenes)[0]!;
  const scene = campaign.scenes[sceneId]!;
  scene.tokens.push({
    id: 't1',
    name: 'Orc',
    gridPos: { col: 0, row: 0 },
    footprint: { w: 1, h: 1 },
    rotation: 0,
    statusEffects: [],
    owner: 'gm',
    color: '#3b82f6',
  });

  const before = createScene(scene.name);
  Object.assign(before, structuredClone(scene));
  before.tokens = [];

  const patches: ObjectPatch[] = [
    {
      ref: { kind: 'token', sceneId, id: 't1' },
      before: null,
      after: cloneSnapshot(scene.tokens[0]!),
    },
  ];

  let history = pushHistoryEntry(createInitialHistoryState(), patches);
  const withToken = applyObjectSnapshot(campaign, patches[0]!.ref, patches[0]!.after);

  const undone = performUndo(withToken, history);
  assert(undone);
  assertEqual(undone!.campaign.scenes[sceneId]!.tokens.length, 0);
  assertEqual(undone!.state.redoStack.length, 1);
}

function testPartialUndoConflict() {
  const campaign = createCampaign('C');
  const sceneId = Object.keys(campaign.scenes)[0]!;
  const tokenA = makeToken('a', 0);
  const tokenB = makeToken('b', 1);

  let c = campaign;
  c = applyObjectSnapshot(c, { kind: 'token', sceneId, id: 'a' }, tokenA);
  c = applyObjectSnapshot(c, { kind: 'token', sceneId, id: 'b' }, tokenB);

  const patches: ObjectPatch[] = [
    {
      ref: { kind: 'token', sceneId, id: 'a' },
      before: cloneSnapshot(tokenA),
      after: { ...cloneSnapshot(tokenA), gridPos: { col: 2, row: 0 } },
    },
    {
      ref: { kind: 'token', sceneId, id: 'b' },
      before: cloneSnapshot(tokenB),
      after: { ...cloneSnapshot(tokenB), gridPos: { col: 3, row: 0 } },
    },
  ];

  let history = pushHistoryEntry(createInitialHistoryState(), patches);

  // Current state matches "after" for both
  let current = c;
  current = applyObjectSnapshot(current, patches[0]!.ref, patches[0]!.after);
  current = applyObjectSnapshot(current, patches[1]!.ref, patches[1]!.after);

  // Remote changes token B only
  const remoteB = { ...cloneSnapshot(tokenB), gridPos: { col: 9, row: 9 } };
  current = applyObjectSnapshot(current, patches[1]!.ref, remoteB);

  const undone = performUndo(current, history);
  assert(undone);
  const a = undone!.campaign.scenes[sceneId]!.tokens.find((t) => t.id === 'a');
  const b = undone!.campaign.scenes[sceneId]!.tokens.find((t) => t.id === 'b');
  assertDeepEqual(a!.gridPos, { col: 0, row: 0 });
  assertDeepEqual(b!.gridPos, { col: 9, row: 9 });
}

function testSuppress() {
  let state = createInitialHistoryState();
  state = { ...state, historySuppressDepth: 1 };
  assertEqual(isHistorySuppressed(state), true);
  state = pushHistoryEntry(state, [
    {
      ref: { kind: 'sceneMeta', sceneId: 'x', id: 'meta' },
      before: { name: 'a', gridOffset: { x: 0, y: 0 } },
      after: { name: 'b', gridOffset: { x: 0, y: 0 } },
    },
  ]);
  assertEqual(state.undoStack.length, 0);
}

function testRedo() {
  const campaign = createCampaign('C');
  const sceneId = Object.keys(campaign.scenes)[0]!;
  const token = makeToken('t1', 0);
  const patch: ObjectPatch = {
    ref: { kind: 'token', sceneId, id: 't1' },
    before: null,
    after: cloneSnapshot(token),
  };
  let history = pushHistoryEntry(createInitialHistoryState(), [patch]);
  let c = applyObjectSnapshot(campaign, patch.ref, patch.after);
  const undone = performUndo(c, history)!;
  c = undone.campaign;
  history = undone.state;
  const redone = performRedo(c, history)!;
  assertEqual(redone.campaign.scenes[sceneId]!.tokens.length, 1);
}

function testCoalesceSimilarOps() {
  const sceneId = 's1';
  const token = makeToken('a', 0);
  const patch1: ObjectPatch = {
    ref: { kind: 'token', sceneId, id: 'a' },
    before: cloneSnapshot(token),
    after: { ...cloneSnapshot(token), gridPos: { col: 1, row: 0 } },
  };
  const patch2: ObjectPatch = {
    ref: { kind: 'token', sceneId, id: 'a' },
    before: { ...cloneSnapshot(token), gridPos: { col: 1, row: 0 } },
    after: { ...cloneSnapshot(token), gridPos: { col: 2, row: 0 } },
  };

  let history = pushHistoryEntry(createInitialHistoryState(), [patch1]);
  assertEqual(history.undoStack.length, 1);
  history = pushHistoryEntry(history, [patch2]);
  assertEqual(history.undoStack.length, 1);
  const merged = history.undoStack[0]!;
  assertDeepEqual(merged.patches[0]!.before, patch1.before);
  assertDeepEqual(merged.patches[0]!.after, patch2.after);
}

function testCoalesceExpiresAfterDebounce() {
  const sceneId = 's1';
  const token = makeToken('a', 0);
  const patch1: ObjectPatch = {
    ref: { kind: 'token', sceneId, id: 'a' },
    before: cloneSnapshot(token),
    after: { ...cloneSnapshot(token), gridPos: { col: 1, row: 0 } },
  };
  const patch2: ObjectPatch = {
    ref: { kind: 'token', sceneId, id: 'a' },
    before: { ...cloneSnapshot(token), gridPos: { col: 1, row: 0 } },
    after: { ...cloneSnapshot(token), gridPos: { col: 2, row: 0 } },
  };

  let history = pushHistoryEntry(createInitialHistoryState(), [patch1]);
  history = {
    ...history,
    undoStack: history.undoStack.map((e) => ({
      ...e,
      timestamp: Date.now() - 5000,
    })),
  };
  history = pushHistoryEntry(history, [patch2]);
  assertEqual(history.undoStack.length, 2);
}

function testCoalesceDifferentKinds() {
  const sceneId = 's1';
  const token = makeToken('a', 0);
  const tokenPatch: ObjectPatch = {
    ref: { kind: 'token', sceneId, id: 'a' },
    before: cloneSnapshot(token),
    after: { ...cloneSnapshot(token), gridPos: { col: 1, row: 0 } },
  };
  const fogBefore = createScene('T').fog;
  const fogAfter = { ...structuredClone(fogBefore), defaultHidden: true };
  const fogPatch: ObjectPatch = {
    ref: { kind: 'fog', sceneId, id: 'fog' },
    before: fogBefore,
    after: fogAfter,
  };

  let history = pushHistoryEntry(createInitialHistoryState(), [tokenPatch]);
  history = pushHistoryEntry(history, [fogPatch]);
  assertEqual(history.undoStack.length, 2);
}

testCoalesceSimilarOps();
testCoalesceExpiresAfterDebounce();
testCoalesceDifferentKinds();
testDiffSceneCreateToken();
testDiffSceneMultiTokenUpdate();
testUndoFullMatch();
testPartialUndoConflict();
testSuppress();
testRedo();

console.log('history.test.ts: all passed');
