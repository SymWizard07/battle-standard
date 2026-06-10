import { useEffect, useRef, type RefObject } from 'react';
import {
  defaultPasteScreenPoint,
  isEditablePasteTarget,
  readClipboardImage,
} from '../lib/pasteTokenImage';
import type { Point } from '../lib/types';
import { useStore } from '../store/useStore';

/** Paste clipboard images as tokens at the last map pointer position. */
export function usePasteTokenImage(
  activeSceneId: string | null,
  mapContainerRef: RefObject<HTMLElement | null>,
) {
  const importPastedTokenImage = useStore((s) => s.importPastedTokenImage);
  const mapPointerRef = useRef<Point | null>(null);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }
      mapPointerRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [mapContainerRef]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditablePasteTarget(e.target)) return;
      if (!activeSceneId || !e.clipboardData) return;

      const file = readClipboardImage(e.clipboardData);
      if (!file) return;

      e.preventDefault();
      const screen =
        mapPointerRef.current ?? defaultPasteScreenPoint(mapContainerRef.current);
      void importPastedTokenImage(activeSceneId, file, screen);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [activeSceneId, importPastedTokenImage, mapContainerRef]);
}
