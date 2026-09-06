import type {
  ImportsInspectTarget,
  Token,
  TokenLibraryEntry,
  TokenImageTransform,
  TokenOutlineStyle,
} from './types';
import { defaultImageTransform } from './tokenImageFit';

export function initialImageTransform(footprint: {
  w: number;
  h: number;
}): TokenImageTransform {
  return defaultImageTransform(footprint);
}

export function appearanceFromToken(
  token: Token,
): Pick<ImportsInspectTarget, 'footprint' | 'imageTransform' | 'outline'> {
  const footprint = { ...token.footprint };
  const imageTransform = token.imageTransform
    ? {
        offset: { ...token.imageTransform.offset },
        size: { ...token.imageTransform.size },
      }
    : initialImageTransform(footprint);
  const outline: TokenOutlineStyle = token.outline
    ? {
        shape: token.outline.shape,
        offset: { ...token.outline.offset },
        size: { ...token.outline.size },
      }
    : {
        shape: 'rect',
        offset: { x: 0, y: 0 },
        size: { w: footprint.w, h: footprint.h },
      };
  return { footprint, imageTransform, outline };
}

export function appearanceFromAssetEntry(
  entry: Extract<TokenLibraryEntry, { kind: 'asset' }>,
): Pick<ImportsInspectTarget, 'footprint' | 'imageTransform' | 'outline'> {
  const footprint = entry.footprint ? { ...entry.footprint } : { w: 1, h: 1 };
  const imageTransform = entry.imageTransform
    ? {
        offset: { ...entry.imageTransform.offset },
        size: { ...entry.imageTransform.size },
      }
    : initialImageTransform(footprint);
  const outline: TokenOutlineStyle = entry.outline
    ? {
        shape: entry.outline.shape,
        offset: { ...entry.outline.offset },
        size: { ...entry.outline.size },
      }
    : {
        shape: 'rect',
        offset: { x: 0, y: 0 },
        size: { w: footprint.w, h: footprint.h },
      };
  return { footprint, imageTransform, outline };
}

export function inspectTargetFromAssetEntry(
  entry: Extract<TokenLibraryEntry, { kind: 'asset' }>,
  scope: 'campaign' | 'global',
): ImportsInspectTarget {
  return {
    assetId: entry.assetId,
    name: entry.name,
    scope,
    entryId: entry.id,
    ...appearanceFromAssetEntry(entry),
  };
}
