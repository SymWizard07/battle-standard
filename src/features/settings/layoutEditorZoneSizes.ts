import type { DeviceClass } from '../layout/schema/layoutSchema';

export type EditorZoneSizes = {
  row: { left: number; middle: number; right: number };
  col: { top: number; center: number; bottom: number };
};

export const DEFAULT_EDITOR_ZONE_SIZES: EditorZoneSizes = {
  row: { left: 18, middle: 64, right: 18 },
  col: { top: 8, center: 84, bottom: 8 },
};

/** Device-specific starting sizes (mirrors default layout presets). */
export const EDITOR_ZONE_SIZES_BY_DEVICE: Record<DeviceClass, EditorZoneSizes> = {
  desktop: DEFAULT_EDITOR_ZONE_SIZES,
  tablet: {
    row: { left: 28, middle: 67, right: 5 },
    col: { top: 10, center: 82, bottom: 8 },
  },
  mobile: {
    row: { left: 8, middle: 84, right: 8 },
    col: { top: 22, center: 70, bottom: 8 },
  },
};

function cloneSizes(sizes: EditorZoneSizes): EditorZoneSizes {
  return {
    row: { ...sizes.row },
    col: { ...sizes.col },
  };
}

export function createDefaultSizesByDevice(): Record<DeviceClass, EditorZoneSizes> {
  return {
    desktop: cloneSizes(EDITOR_ZONE_SIZES_BY_DEVICE.desktop),
    tablet: cloneSizes(EDITOR_ZONE_SIZES_BY_DEVICE.tablet),
    mobile: cloneSizes(EDITOR_ZONE_SIZES_BY_DEVICE.mobile),
  };
}
