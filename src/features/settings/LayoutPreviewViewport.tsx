import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fitSizeToAspectRatio, useAppLayoutSurfaceSize } from './useAppLayoutSurfaceSize';

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Sizes the preview to the same aspect ratio as the live app layout surface,
 * scaled to fit the available editor area.
 */
export function LayoutPreviewViewport({ children, className = '' }: Props) {
  const appSurface = useAppLayoutSurfaceSize();
  const hostRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setHost({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const previewSize = useMemo(
    () => fitSizeToAspectRatio(host.width, host.height, appSurface.width, appSurface.height),
    [host.width, host.height, appSurface.width, appSurface.height],
  );

  return (
    <div
      ref={hostRef}
      className={`flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-slate-950/80 ${className}`}
    >
      {previewSize ? (
        <div
          className="shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-inner"
          style={{
            width: previewSize.width,
            height: previewSize.height,
          }}
        >
          <div className="h-full w-full">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
