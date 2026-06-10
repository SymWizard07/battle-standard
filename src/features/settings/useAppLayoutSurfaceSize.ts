import { useEffect, useState } from 'react';

export const APP_LAYOUT_SURFACE_SELECTOR = '[data-app-layout-surface]';

export type ViewportSize = { width: number; height: number };

function readElementSize(el: Element): ViewportSize {
  const rect = el.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function readFallbackAppSize(): ViewportSize {
  if (typeof document === 'undefined') return { width: 0, height: 0 };

  const surface = document.querySelector(APP_LAYOUT_SURFACE_SELECTOR);
  if (surface) {
    const size = readElementSize(surface);
    if (size.width > 0 && size.height > 0) return size;
  }

  const root = document.getElementById('root');
  if (root) {
    const size = readElementSize(root);
    if (size.width > 0 && size.height > 0) return size;
  }

  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

/** Size of the live campaign layout surface (same box as LayoutShell). */
export function useAppLayoutSurfaceSize(): ViewportSize {
  const [size, setSize] = useState(readFallbackAppSize);

  useEffect(() => {
    const update = () => setSize(readFallbackAppSize());
    update();

    const surface = document.querySelector(APP_LAYOUT_SURFACE_SELECTOR);
    const observed = surface ?? document.getElementById('root');
    const ro =
      observed &&
      new ResizeObserver(() => {
        update();
      });
    if (ro && observed) ro.observe(observed);

    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  return size;
}

/** Largest rectangle with the given aspect ratio that fits inside the host bounds. */
export function fitSizeToAspectRatio(
  hostWidth: number,
  hostHeight: number,
  aspectWidth: number,
  aspectHeight: number,
): { width: number; height: number } | null {
  if (hostWidth <= 0 || hostHeight <= 0 || aspectWidth <= 0 || aspectHeight <= 0) {
    return null;
  }
  const ratio = aspectWidth / aspectHeight;
  let width = hostWidth;
  let height = width / ratio;
  if (height > hostHeight) {
    height = hostHeight;
    width = height * ratio;
  }
  return {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  };
}
