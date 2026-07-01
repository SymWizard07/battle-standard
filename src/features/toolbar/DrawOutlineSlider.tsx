import {
  DRAW_STROKE_WIDTH_DEFAULT,
  drawStrokeWidthFromSliderRelease,
  drawStrokeWidthKeyboardDelta,
  drawStrokeWidthToSlider,
  DRAW_OUTLINE_SLIDER_DIVISIONS,
  outlineSliderIndexFromPosition,
  outlineSliderPositionFromIndex,
  sliderToDrawStrokeWidth,
  stepDrawStrokeWidth,
} from '../../lib/drawConstants';

export function DrawOutlineSlider({
  value,
  onChange,
  label = 'Outline',
}: {
  value: number;
  onChange: (width: number) => void;
  label?: string;
}) {
  const sliderPos = drawStrokeWidthToSlider(value);
  const sliderIndex = outlineSliderIndexFromPosition(sliderPos);
  const atDefault = value === DRAW_STROKE_WIDTH_DEFAULT;

  const commitRelease = (index: number) => {
    onChange(drawStrokeWidthFromSliderRelease(outlineSliderPositionFromIndex(index)));
  };

  return (
    <div className="box-border flex h-full w-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800/30 px-3 py-1">
      <div className="flex w-full min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="relative flex w-full min-w-0 items-center px-0.5">
          <div
            className="pointer-events-none absolute inset-x-0.5 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-slate-900/80 ring-1 ring-inset ring-slate-700/90"
            aria-hidden
          >
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-slate-600/50 to-amber-500/35"
              style={{ width: `${sliderPos}%` }}
            />
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-500/70" />
          </div>
          <input
            type="range"
            min={0}
            max={DRAW_OUTLINE_SLIDER_DIVISIONS}
            step={1}
            value={sliderIndex}
            onChange={(e) =>
              onChange(
                sliderToDrawStrokeWidth(outlineSliderPositionFromIndex(Number(e.target.value))),
              )
            }
            onPointerUp={(e) => commitRelease(Number(e.currentTarget.value))}
            onPointerCancel={(e) => commitRelease(Number(e.currentTarget.value))}
            onKeyDown={(e) => {
              const delta = drawStrokeWidthKeyboardDelta(e);
              if (delta == null) return;
              e.preventDefault();
              onChange(stepDrawStrokeWidth(value, delta));
            }}
            onKeyUp={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
                commitRelease(Number(e.currentTarget.value));
              }
            }}
            className="draw-outline-slider relative z-[1] w-full min-w-0"
            aria-label={label}
            aria-valuetext={`${value} pixels${atDefault ? ', default' : ''}`}
          />
        </div>
        <div
          className="flex justify-between px-0.5 text-[10px] leading-none text-slate-500"
          aria-hidden
        >
          <span>−</span>
          <span>+</span>
        </div>
      </div>
      <span className="shrink-0 text-[10px] font-medium leading-tight text-slate-300">{label}</span>
    </div>
  );
}
