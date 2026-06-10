import { useEffect, useState, type CSSProperties } from 'react';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import { getTemplateTokenObjectUrl } from '../../lib/templateTokenImage';

const DEFAULT_FLY_MS = 480;

type Props = {
  templateColor: string;
  opacity: number;
  left: number;
  top: number;
  animate: boolean;
  flyDurationMs: number;
  onLoaded: () => void;
};

/** Loads off-screen; mounts only when ready to fly — no placeholder rect. */
export function ScatteredFlyingToken({
  templateColor,
  opacity,
  left,
  top,
  animate,
  flyDurationMs,
  onLoaded,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let alive = true;
    void getTemplateTokenObjectUrl(templateColor).then((objectUrl) => {
      if (!alive) return;
      setUrl(objectUrl);
      onLoaded();
    });
    return () => {
      alive = false;
    };
  }, [templateColor, onLoaded]);

  useEffect(() => {
    if (animate && url) {
      setMounted(true);
    }
  }, [animate, url]);

  if (!mounted || !url) return null;

  return (
    <img
      src={url}
      alt=""
      width={GRID_SIZE_PX}
      height={GRID_SIZE_PX}
      draggable={false}
      className="scattered-token-fly-in h-full w-full"
      style={
        {
          '--fly-from-x': `${-(left + GRID_SIZE_PX * 1.5)}px`,
          '--fly-from-y': `${-(top + GRID_SIZE_PX * 1.5)}px`,
          '--token-opacity': opacity,
          '--fly-duration': `${flyDurationMs}ms`,
        } as CSSProperties
      }
    />
  );
}

export { DEFAULT_FLY_MS };
