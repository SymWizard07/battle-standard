import { useEffect, useRef } from 'react';

const EDGE_PX = 44;
const SCROLL_STEP = 10;

export function scrollLibraryNearPointer(clientX: number, clientY: number) {
  const scrollEl = document.querySelector('[data-token-library-scroll]') as HTMLElement | null;
  if (!scrollEl) return;
  const rect = scrollEl.getBoundingClientRect();
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return;
  }
  if (clientY < rect.top + EDGE_PX) scrollEl.scrollTop -= SCROLL_STEP;
  else if (clientY > rect.bottom - EDGE_PX) scrollEl.scrollTop += SCROLL_STEP;
}

export function useLibraryDragScroll(active: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      el.scrollTop += e.deltaY;
      e.preventDefault();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [active]);

  const onDragOver = (e: React.DragEvent) => {
    if (!active) return;
    scrollLibraryNearPointer(e.clientX, e.clientY);
  };

  return { scrollRef, onDragOver };
}
