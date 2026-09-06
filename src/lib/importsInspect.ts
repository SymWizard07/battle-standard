import type {
  ImportsInspectTarget,
  Token,
  TokenLibraryEntry,
  TokenImageTransform,
  TokenOutlineStyle,
} from './types';
import {
  canonicalFootprintFromAspect,
  defaultImageTransform,
  defaultOutline,
  freshCanonicalAppearance,
  scaleAppearanceBetweenFootprints,
} from './tokenImageFit';

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
    : defaultOutline(footprint);
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
    : defaultOutline(footprint);
  return { footprint, imageTransform, outline };
}

/** Library entry has a previously saved Appearance (image + outline written on save). */
export function assetEntryHasSavedAppearance(
  entry: Extract<TokenLibraryEntry, { kind: 'asset' }> | undefined | null,
): boolean {
  return Boolean(entry && entry.imageTransform && entry.outline);
}

/** Map token received Appearance from a prior save. */
export function tokenHasSavedAppearance(token: Token): boolean {
  return Boolean(token.imageTransform && token.outline);
}

/** Remap saved cell units into the 1-cell-min editor footprint. */
export function appearanceInCanonicalEditorSpace(
  appearance: Pick<ImportsInspectTarget, 'footprint' | 'imageTransform' | 'outline'>,
): Pick<ImportsInspectTarget, 'footprint' | 'imageTransform' | 'outline'> {
  const aspect =
    appearance.footprint.h > 0
      ? appearance.footprint.w / appearance.footprint.h
      : 1;
  const footprint = canonicalFootprintFromAspect(aspect);
  if (
    Math.abs(footprint.w - appearance.footprint.w) < 1e-6 &&
    Math.abs(footprint.h - appearance.footprint.h) < 1e-6
  ) {
    return {
      footprint: { ...appearance.footprint },
      imageTransform: {
        offset: { ...appearance.imageTransform.offset },
        size: { ...appearance.imageTransform.size },
      },
      outline: {
        shape: appearance.outline.shape,
        offset: { ...appearance.outline.offset },
        size: { ...appearance.outline.size },
      },
    };
  }
  const scaled = scaleAppearanceBetweenFootprints(
    appearance.footprint,
    footprint,
    {
      imageTransform: appearance.imageTransform,
      outline: appearance.outline,
    },
  );
  return { footprint, ...scaled };
}

/**
 * Open Appearance for a library asset: restore last save when present,
 * otherwise start fresh and seed from the image.
 */
export function inspectTargetFromAssetEntry(
  entry: Extract<TokenLibraryEntry, { kind: 'asset' }>,
  scope: 'campaign' | 'global',
): ImportsInspectTarget {
  if (assetEntryHasSavedAppearance(entry)) {
    return {
      assetId: entry.assetId,
      name: entry.name,
      scope,
      entryId: entry.id,
      ...appearanceInCanonicalEditorSpace(appearanceFromAssetEntry(entry)),
      needsImageSeed: false,
    };
  }
  return {
    assetId: entry.assetId,
    name: entry.name,
    scope,
    entryId: entry.id,
    ...freshCanonicalAppearance(),
    needsImageSeed: true,
  };
}

/**
 * Open Appearance for a map token: prefer library last-save, else token last-save
 * remapped into editor space, else fresh image seed.
 */
export function inspectTargetFromMapToken(
  token: Token & { imageAssetId: string },
  opts: {
    scope: ImportsInspectTarget['scope'];
    entryId?: string;
    libraryEntry?: Extract<TokenLibraryEntry, { kind: 'asset' }>;
  },
): ImportsInspectTarget {
  const base = {
    assetId: token.imageAssetId,
    name: token.name,
    scope: opts.scope,
    entryId: opts.entryId,
  };

  if (opts.libraryEntry && assetEntryHasSavedAppearance(opts.libraryEntry)) {
    return {
      ...base,
      ...appearanceInCanonicalEditorSpace(appearanceFromAssetEntry(opts.libraryEntry)),
      needsImageSeed: false,
    };
  }

  if (tokenHasSavedAppearance(token)) {
    return {
      ...base,
      ...appearanceInCanonicalEditorSpace(appearanceFromToken(token)),
      needsImageSeed: false,
    };
  }

  return {
    ...base,
    ...freshCanonicalAppearance(),
    needsImageSeed: true,
  };
}
