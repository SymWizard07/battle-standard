import { create } from 'zustand';
import { DICE_SIDES, type DiceSides } from './diceTypes';
import {
  defaultDieFaceGlyphLayout,
  type DieFaceGlyphLayout,
} from './dieFaceFonts';
import { DEFAULT_DIE_FACE_SHADER } from './faceShaderLib';

function defaultShaders(): Record<DiceSides, string> {
  const shaders = {} as Record<DiceSides, string>;
  for (const sides of DICE_SIDES) shaders[sides] = DEFAULT_DIE_FACE_SHADER;
  return shaders;
}

function defaultLayouts(): Record<DiceSides, DieFaceGlyphLayout> {
  const layouts = {} as Record<DiceSides, DieFaceGlyphLayout>;
  for (const sides of DICE_SIDES) layouts[sides] = defaultDieFaceGlyphLayout();
  return layouts;
}

type DieFaceShaderState = {
  shaders: Partial<Record<DiceSides, string>>;
  /** Glyph layout (font / size / offsets) paired with each die type's shader. */
  layouts: Partial<Record<DiceSides, DieFaceGlyphLayout>>;
  dragSource: string | null;
  dragLayout: DieFaceGlyphLayout | null;
  setShader: (
    sides: DiceSides,
    source: string,
    layout?: Partial<DieFaceGlyphLayout>,
  ) => void;
  setAllShaders: (source: string, layout?: Partial<DieFaceGlyphLayout>) => void;
  resetToDefaults: () => void;
  clearShader: (sides: DiceSides) => void;
  beginDrag: (source: string, layout: DieFaceGlyphLayout) => void;
  endDrag: () => void;
};

export const useDieFaceShaderStore = create<DieFaceShaderState>((set) => ({
  shaders: defaultShaders(),
  layouts: defaultLayouts(),
  dragSource: null,
  dragLayout: null,

  setShader: (sides, source, layout) =>
    set((s) => ({
      shaders: { ...s.shaders, [sides]: source },
      layouts: {
        ...s.layouts,
        [sides]: defaultDieFaceGlyphLayout({
          ...s.layouts[sides],
          ...s.dragLayout,
          ...layout,
        }),
      },
    })),

  setAllShaders: (source, layout) => {
    const shaders: Partial<Record<DiceSides, string>> = {};
    const layouts: Partial<Record<DiceSides, DieFaceGlyphLayout>> = {};
    const resolved = defaultDieFaceGlyphLayout(layout);
    for (const sides of DICE_SIDES) {
      shaders[sides] = source;
      layouts[sides] = resolved;
    }
    set({ shaders, layouts });
  },

  resetToDefaults: () =>
    set({
      shaders: defaultShaders(),
      layouts: defaultLayouts(),
    }),

  clearShader: (sides) =>
    set((s) => {
      const nextShaders = { ...s.shaders };
      const nextLayouts = { ...s.layouts };
      delete nextShaders[sides];
      delete nextLayouts[sides];
      return { shaders: nextShaders, layouts: nextLayouts };
    }),

  beginDrag: (source, layout) =>
    set({
      dragSource: source,
      dragLayout: defaultDieFaceGlyphLayout(layout),
    }),

  endDrag: () => set({ dragSource: null, dragLayout: null }),
}));

/** Convenience: read layout for a die type with defaults filled in. */
export function dieFaceLayoutFor(
  sides: DiceSides,
): DieFaceGlyphLayout {
  const layout = useDieFaceShaderStore.getState().layouts[sides];
  return defaultDieFaceGlyphLayout(layout);
}
