import { create } from 'zustand';
import { DICE_SIDES, type DiceSides } from './diceTypes';
import { DEFAULT_DIE_FACE_SHADER } from './faceShaderLib';

function defaultShaders(): Record<DiceSides, string> {
  const shaders = {} as Record<DiceSides, string>;
  for (const sides of DICE_SIDES) shaders[sides] = DEFAULT_DIE_FACE_SHADER;
  return shaders;
}

type DieFaceShaderState = {
  shaders: Partial<Record<DiceSides, string>>;
  dragSource: string | null;
  setShader: (sides: DiceSides, source: string) => void;
  setAllShaders: (source: string) => void;
  resetToDefaults: () => void;
  clearShader: (sides: DiceSides) => void;
  beginDrag: (source: string) => void;
  endDrag: () => void;
};

export const useDieFaceShaderStore = create<DieFaceShaderState>((set) => ({
  shaders: defaultShaders(),
  dragSource: null,

  setShader: (sides, source) =>
    set((s) => ({
      shaders: { ...s.shaders, [sides]: source },
    })),

  setAllShaders: (source) => {
    const shaders: Partial<Record<DiceSides, string>> = {};
    for (const sides of DICE_SIDES) shaders[sides] = source;
    set({ shaders });
  },

  resetToDefaults: () => set({ shaders: defaultShaders() }),

  clearShader: (sides) =>
    set((s) => {
      const next = { ...s.shaders };
      delete next[sides];
      return { shaders: next };
    }),

  beginDrag: (source) => set({ dragSource: source }),
  endDrag: () => set({ dragSource: null }),
}));
