import assert from 'node:assert/strict';
import { migrateLegacyFogState, normalizeFogState, isFogFullyClear } from './fog';
import {
  CHUNK_WORLD,
  appendFogOpsToMaskSet,
  chunkKey,
  createFogMask,
  createFogMaskSet,
  sampleFogMaskSet,
  sampleFogMaskWithDefault,
  shiftFogOps,
  worldToChunkCoord,
  type FogMask,
} from './fogMask';
import type { FogState, Point } from './types';

function assertHidden(mask: FogMask, world: Point, defaultHidden: boolean, expect: boolean) {
  assert.equal(
    sampleFogMaskWithDefault(mask, world, defaultHidden),
    expect,
    `at ${world.x},${world.y} expected hidden=${expect}`,
  );
}

function assertSetHidden(
  set: ReturnType<typeof createFogMaskSet>,
  world: Point,
  expect: boolean,
) {
  assert.equal(
    sampleFogMaskSet(set, world),
    expect,
    `set at ${world.x},${world.y} expected hidden=${expect}`,
  );
}

// Base clear
{
  const fog: FogState = { defaultHidden: false, ops: [] };
  assert.ok(isFogFullyClear(fog));
  const mask = createFogMask(fog, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
  assertHidden(mask, { x: 50, y: 50 }, false, false);
}

// Base full + reveal rect
{
  const fog: FogState = {
    defaultHidden: true,
    ops: [{ id: 'r1', kind: 'rect', mode: 'reveal', x: 20, y: 20, w: 40, h: 40 }],
  };
  const mask = createFogMask(fog, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
  assertHidden(mask, { x: 10, y: 10 }, true, true);
  assertHidden(mask, { x: 40, y: 40 }, true, false);
}

// Hide island inside revealed area, then focused reveal clears it
{
  const fog: FogState = {
    defaultHidden: true,
    ops: [
      { id: 'r1', kind: 'rect', mode: 'reveal', x: 0, y: 0, w: 100, h: 100 },
      { id: 'h1', kind: 'rect', mode: 'hide', x: 40, y: 40, w: 20, h: 20 },
    ],
  };
  let mask = createFogMask(fog, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
  assertHidden(mask, { x: 50, y: 50 }, true, true);
  assertHidden(mask, { x: 10, y: 10 }, true, false);

  fog.ops.push({ id: 'r2', kind: 'rect', mode: 'reveal', x: 40, y: 40, w: 20, h: 20 });
  mask = createFogMask(fog, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
  assertHidden(mask, { x: 50, y: 50 }, true, false);
}

// Stroke paint
{
  const fog: FogState = {
    defaultHidden: true,
    ops: [
      {
        id: 's1',
        kind: 'stroke',
        mode: 'reveal',
        points: [
          { x: 10, y: 50 },
          { x: 90, y: 50 },
        ],
        radius: 8,
      },
    ],
  };
  const mask = createFogMask(fog, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
  assertHidden(mask, { x: 50, y: 50 }, true, false);
  assertHidden(mask, { x: 50, y: 80 }, true, true);
}

// Legacy migration
{
  const legacy = {
    defaultHidden: true,
    unexploredMask: [
      {
        id: 'u1',
        rings: [
          [
            { x: 40, y: 40 },
            { x: 60, y: 40 },
            { x: 60, y: 60 },
            { x: 40, y: 60 },
          ],
        ],
      },
    ],
    revealedMask: [
      {
        id: 'r1',
        rings: [
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
        ],
      },
    ],
  };
  const migrated = migrateLegacyFogState(legacy);
  assert.equal(migrated.defaultHidden, true);
  assert.ok(migrated.ops.length >= 2);
  const norm = normalizeFogState(legacy as never);
  assert.equal(norm.ops.length, migrated.ops.length);

  const mask = createFogMask(migrated, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
  assertHidden(mask, { x: 10, y: 10 }, true, false);
  assertHidden(mask, { x: 50, y: 50 }, true, true);
}

// shiftFogOps
{
  const ops = shiftFogOps(
    [{ id: 'r', kind: 'rect', mode: 'hide', x: 10, y: 20, w: 5, h: 5 }],
    { x: 3, y: -2 },
  );
  assert.equal(ops[0]!.kind, 'rect');
  if (ops[0]!.kind === 'rect') {
    assert.equal(ops[0].x, 13);
    assert.equal(ops[0].y, 18);
  }
}

// Sparse chunks: paint allocates only touched tiles
{
  const fog: FogState = {
    defaultHidden: true,
    ops: [{ id: 'r1', kind: 'rect', mode: 'reveal', x: 10, y: 10, w: 20, h: 20 }],
  };
  const set = createFogMaskSet(fog);
  assert.equal(set.chunks.size, 1);
  assert.ok(set.chunks.has(chunkKey(0, 0)));
  assertSetHidden(set, { x: 15, y: 15 }, false);
  // Outside any allocated chunk → defaultHidden
  assertSetHidden(set, { x: CHUNK_WORLD + 50, y: CHUNK_WORLD + 50 }, true);
}

// Painting across chunk boundary allocates both chunks
{
  const fog: FogState = {
    defaultHidden: false,
    ops: [
      {
        id: 'r1',
        kind: 'rect',
        mode: 'hide',
        x: CHUNK_WORLD - 40,
        y: 10,
        w: 80,
        h: 20,
      },
    ],
  };
  const set = createFogMaskSet(fog);
  assert.ok(set.chunks.size >= 2);
  assert.ok(set.chunks.has(chunkKey(0, 0)));
  assert.ok(set.chunks.has(chunkKey(1, 0)));
  assertSetHidden(set, { x: CHUNK_WORLD - 10, y: 15 }, true);
  assertSetHidden(set, { x: CHUNK_WORLD + 10, y: 15 }, true);
  // Untouched far chunk not allocated; samples as clear (defaultHidden false)
  assert.equal(set.chunks.has(chunkKey(5, 5)), false);
  assertSetHidden(set, { x: 5 * CHUNK_WORLD + 10, y: 5 * CHUNK_WORLD + 10 }, false);
}

// Incremental append allocates new chunks without dropping old ones
{
  const fog: FogState = {
    defaultHidden: true,
    ops: [{ id: 'r1', kind: 'rect', mode: 'reveal', x: 10, y: 10, w: 20, h: 20 }],
  };
  const set = createFogMaskSet(fog);
  const firstKey = chunkKey(0, 0);
  const firstChunk = set.chunks.get(firstKey)!;
  assert.ok(firstChunk);

  const farX = CHUNK_WORLD * 3 + 10;
  const farY = 10;
  appendFogOpsToMaskSet(set, [
    { id: 'r2', kind: 'rect', mode: 'reveal', x: farX, y: farY, w: 20, h: 20 },
  ]);
  assert.ok(set.chunks.has(firstKey));
  assert.equal(set.chunks.get(firstKey), firstChunk, 'existing chunk object reused');
  const farCx = worldToChunkCoord(farX);
  assert.ok(set.chunks.has(chunkKey(farCx, 0)));
  assertSetHidden(set, { x: 15, y: 15 }, false);
  assertSetHidden(set, { x: farX + 5, y: farY + 5 }, false);
}

console.log('fogMask.test.ts: ok');
