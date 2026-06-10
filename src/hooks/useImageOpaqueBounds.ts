import { useEffect, useState } from 'react';
import {
  cacheOpaqueShape,
  computeOpaqueShapeFromImage,
  getCachedOpaqueShape,
  type ImageOpaqueShape,
} from '../lib/imageOpaqueBounds';

export function useImageOpaqueShape(
  url: string | undefined,
  img: HTMLImageElement | null,
): ImageOpaqueShape | null {
  const [shape, setShape] = useState<ImageOpaqueShape | null>(() =>
    url ? (getCachedOpaqueShape(url) ?? null) : null,
  );

  useEffect(() => {
    if (!url || !img) {
      if (!url) setShape(null);
      return;
    }

    const cached = getCachedOpaqueShape(url);
    if (cached) {
      setShape(cached);
      return;
    }

    try {
      const next = computeOpaqueShapeFromImage(img);
      if (next) cacheOpaqueShape(url, next);
      setShape(next);
    } catch {
      setShape(null);
    }
  }, [url, img]);

  return shape;
}

/** @deprecated Use useImageOpaqueShape */
export const useImageOpaqueBounds = useImageOpaqueShape;
