import { playAreaGridBackgroundStyle } from './playAreaGridStyle';

const gridStyle = playAreaGridBackgroundStyle;

/** Sharp full-viewport grid (absolute — same containing block as frost panel). */
export function PlayAreaGridBackground() {
  return (
    <div
      aria-hidden
      className="play-area-grid pointer-events-none absolute inset-0 z-0 bg-slate-950"
      style={gridStyle}
    />
  );
}

/**
 * Viewport-aligned blurred grid lines — transparent fill so tokens stay visible underneath.
 * Fixed to the viewport (not calc(50% - 50vw)) so the tile phase matches the sharp grid.
 * Clipped to the frost column; sits above tokens, below content.
 */
export function PlayAreaGridBackgroundBlurred() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="play-area-grid pointer-events-none fixed inset-0 blur-[4px]"
        style={{
          backgroundColor: 'transparent',
          backgroundImage: gridStyle.backgroundImage,
          backgroundSize: gridStyle.backgroundSize,
          backgroundPosition: gridStyle.backgroundPosition,
          backgroundRepeat: gridStyle.backgroundRepeat,
        }}
      />
    </div>
  );
}
