/**
 * Run with: npx tsx src/lib/importsInspect.test.ts
 */
import {
  appearanceInCanonicalEditorSpace,
  assetEntryHasSavedAppearance,
  inspectTargetFromAssetEntry,
  inspectTargetFromMapToken,
  tokenHasSavedAppearance,
} from './importsInspect';
import type { Token, TokenLibraryEntry } from './types';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function nearly(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

function stubToken(
  partial: Partial<Token> & { imageAssetId: string; name: string; id: string },
): Token & { imageAssetId: string } {
  return {
    rotation: 0,
    statusEffects: [],
    owner: 'gm',
    color: '#fff',
    gridPos: { col: 0, row: 0 },
    footprint: { w: 1, h: 1 },
    ...partial,
  };
}

{
  const entry = {
    id: 'e1',
    groupId: 'g1',
    kind: 'asset' as const,
    assetId: 'a1',
    name: 'Goblin',
    order: 0,
    footprint: { w: 2, h: 1 },
    imageTransform: { offset: { x: 0.1, y: 0 }, size: { w: 1.8, h: 1 } },
    outline: {
      shape: 'rect' as const,
      offset: { x: 0.2, y: 0.1 },
      size: { w: 1.6, h: 0.8 },
    },
  } satisfies Extract<TokenLibraryEntry, { kind: 'asset' }>;

  assert(assetEntryHasSavedAppearance(entry));
  const target = inspectTargetFromAssetEntry(entry, 'campaign');
  assert(target.needsImageSeed === false);
  assert(nearly(target.footprint.w, 2) && nearly(target.footprint.h, 1));
  assert(nearly(target.imageTransform.offset.x, 0.1));
  assert(nearly(target.outline.size.w, 1.6));
}

{
  const token = stubToken({
    id: 't1',
    name: 'Goblin',
    imageAssetId: 'a1',
    footprint: { w: 4, h: 2 },
    imageTransform: { offset: { x: 0.2, y: 0 }, size: { w: 3.6, h: 2 } },
    outline: {
      shape: 'rect',
      offset: { x: 0.4, y: 0.2 },
      size: { w: 3.2, h: 1.6 },
    },
  });

  assert(tokenHasSavedAppearance(token));
  const target = inspectTargetFromMapToken(token, { scope: 'map' });
  assert(target.needsImageSeed === false);
  assert(nearly(target.footprint.w, 2) && nearly(target.footprint.h, 1));
  assert(nearly(target.imageTransform.size.w, 1.8));
  assert(nearly(target.outline.size.w, 1.6));
}

{
  const remapped = appearanceInCanonicalEditorSpace({
    footprint: { w: 4, h: 2 },
    imageTransform: { offset: { x: 0, y: 0 }, size: { w: 4, h: 2 } },
    outline: {
      shape: 'rect',
      offset: { x: 0, y: 0 },
      size: { w: 4, h: 2 },
    },
  });
  assert(nearly(remapped.footprint.w, 2) && nearly(remapped.footprint.h, 1));
  assert(nearly(remapped.imageTransform.size.w, 2));
}

{
  const fresh = inspectTargetFromMapToken(
    stubToken({ id: 't2', name: 'New', imageAssetId: 'a2' }),
    { scope: 'map' },
  );
  assert(fresh.needsImageSeed === true);
}

console.log('importsInspect.test.ts: ok');
