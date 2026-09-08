/**
 * Fonts available for die face glyphs / shader preview.
 * Lacquer & MedievalSharp load from Google Fonts (see index.html).
 */
export const DIE_FACE_FONTS = [
  {
    id: 'segoe',
    label: 'Segoe UI',
    family: '"Segoe UI", system-ui, sans-serif',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    family: 'Georgia, "Times New Roman", serif',
  },
  {
    id: 'impact',
    label: 'Impact',
    family: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
  },
  {
    id: 'lacquer',
    label: 'Lacquer',
    family: 'Lacquer, cursive',
  },
  {
    id: 'courier',
    label: 'Courier',
    family: '"Courier New", Courier, monospace',
  },
  {
    id: 'medieval',
    label: 'Medieval',
    family: 'MedievalSharp, "Palatino Linotype", Palatino, serif',
  },
  {
    id: 'trebuchet',
    label: 'Trebuchet',
    family: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
  },
  {
    id: 'bebas',
    label: 'Bebas Neue',
    family: '"Bebas Neue", ui-sans-serif, system-ui, sans-serif',
  },
] as const;

export type DieFaceFontId = (typeof DIE_FACE_FONTS)[number]['id'];

export const DEFAULT_DIE_FACE_FONT_ID: DieFaceFontId = 'segoe';

/** Sample glyphs for the settings shader preview square. */
export const DIE_FACE_SAMPLE_NUMBERS = ['1', '6', '8', '10', '13', '20'] as const;
export type DieFaceSampleNumber = (typeof DIE_FACE_SAMPLE_NUMBERS)[number];
export const DEFAULT_DIE_FACE_SAMPLE: DieFaceSampleNumber = '13';

/** Glyph size as percent of the default face paint size. */
export const DEFAULT_DIE_FACE_FONT_SIZE = 100;
export const DIE_FACE_FONT_SIZE_MIN = 50;
export const DIE_FACE_FONT_SIZE_MAX = 200;
export const DIE_FACE_FONT_SIZE_STEP = 5;

export function clampDieFaceFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_DIE_FACE_FONT_SIZE;
  const stepped =
    Math.round(size / DIE_FACE_FONT_SIZE_STEP) * DIE_FACE_FONT_SIZE_STEP;
  return Math.max(
    DIE_FACE_FONT_SIZE_MIN,
    Math.min(DIE_FACE_FONT_SIZE_MAX, stepped),
  );
}

export function dieFaceFontSizeScale(sizePercent: number): number {
  return clampDieFaceFontSize(sizePercent) / 100;
}

/** Glyph offset as percent of face cell (− left/down … + right/up). */
export const DEFAULT_DIE_FACE_OFFSET = 0;
export const DIE_FACE_OFFSET_MIN = -40;
export const DIE_FACE_OFFSET_MAX = 40;
export const DIE_FACE_OFFSET_STEP = 1;

export function clampDieFaceOffset(offset: number): number {
  if (!Number.isFinite(offset)) return DEFAULT_DIE_FACE_OFFSET;
  const stepped = Math.round(offset / DIE_FACE_OFFSET_STEP) * DIE_FACE_OFFSET_STEP;
  return Math.max(DIE_FACE_OFFSET_MIN, Math.min(DIE_FACE_OFFSET_MAX, stepped));
}

/** Layout applied with a die's face shader (font + size + offsets). */
export type DieFaceGlyphLayout = {
  fontId: DieFaceFontId;
  fontSize: number;
  offsetX: number;
  offsetY: number;
};

export function defaultDieFaceGlyphLayout(
  partial?: Partial<DieFaceGlyphLayout>,
): DieFaceGlyphLayout {
  return {
    fontId: isDieFaceFontId(partial?.fontId ?? '')
      ? (partial!.fontId as DieFaceFontId)
      : DEFAULT_DIE_FACE_FONT_ID,
    fontSize: clampDieFaceFontSize(
      partial?.fontSize ?? DEFAULT_DIE_FACE_FONT_SIZE,
    ),
    offsetX: clampDieFaceOffset(partial?.offsetX ?? DEFAULT_DIE_FACE_OFFSET),
    offsetY: clampDieFaceOffset(partial?.offsetY ?? DEFAULT_DIE_FACE_OFFSET),
  };
}

export function dieFaceFontFamily(id: string): string {
  const hit = DIE_FACE_FONTS.find((f) => f.id === id);
  return hit?.family ?? DIE_FACE_FONTS[0]!.family;
}

export function isDieFaceFontId(id: string): id is DieFaceFontId {
  return DIE_FACE_FONTS.some((f) => f.id === id);
}

/** Ensure the primary family name is ready before canvas paint (best-effort). */
export async function ensureDieFaceFontLoaded(fontId: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const family = dieFaceFontFamily(fontId);
  const primary = family.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? family;
  try {
    await document.fonts.load(`700 48px ${primary}`);
  } catch {
    // Fall back to whatever the browser substitutes.
  }
}
