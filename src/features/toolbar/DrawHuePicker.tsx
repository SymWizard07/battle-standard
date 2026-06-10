import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clampHueSlot,
  colorFromHue,
  HUE_SLOT_COUNT,
  hueFromSlot,
  hueSliderGradient,
  hueSlotIndex,
  snapHue,
} from '../../lib/playerColor';
import { toolBarBtnIcon, toolBarControl } from './toolBarStyles';

type Variant = 'button' | 'swatch';

function slotFromPointer(track: HTMLDivElement, clientX: number): number {
  const rect = track.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return clampHueSlot(Math.round(ratio * (HUE_SLOT_COUNT - 1)));
}

function HueGradientTrack({
  hue,
  onChange,
}: {
  hue: number;
  onChange: (hue: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const safeHue = snapHue(hue ?? 0);
  const slot = hueSlotIndex(safeHue);
  const color = colorFromHue(safeHue);
  const segmentWidth = 100 / HUE_SLOT_COUNT;

  const pickAt = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      onChange(hueFromSlot(slotFromPointer(track, clientX)));
    },
    [onChange],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    pickAt(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    pickAt(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(hueFromSlot(clampHueSlot(slot - 1)));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(hueFromSlot(clampHueSlot(slot + 1)));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(hueFromSlot(0));
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(hueFromSlot(HUE_SLOT_COUNT - 1));
    }
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={HUE_SLOT_COUNT - 1}
      aria-valuenow={slot}
      aria-valuetext={color}
      className="relative h-6 cursor-pointer overflow-hidden rounded-md border border-slate-600 touch-none select-none"
      style={{ background: hueSliderGradient() }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div
        className="pointer-events-none absolute inset-y-0 ring-2 ring-inset ring-white"
        style={{
          left: `${slot * segmentWidth}%`,
          width: `${segmentWidth}%`,
          backgroundColor: color,
        }}
        aria-hidden
      />
    </div>
  );
}

export function DrawHuePicker({
  hue,
  onChange,
  variant = 'button',
}: {
  hue: number;
  onChange: (hue: number) => void;
  variant?: Variant;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const safeHue = snapHue(hue ?? 0);
  const color = colorFromHue(safeHue);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, left: rect.left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onScrollOrResize = () => updatePosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const triggerClass =
    variant === 'swatch'
      ? `flex ${toolBarControl} w-11 cursor-pointer items-center justify-center rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700`
      : `${toolBarBtnIcon} cursor-pointer bg-slate-800 text-slate-200 hover:bg-slate-700`;

  const popover =
    open &&
    createPortal(
      <div
        ref={popoverRef}
        className="fixed z-[100] w-64 rounded-lg border border-slate-600 bg-slate-800 p-3 shadow-xl"
        style={{ top: position.top, left: position.left }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <HueGradientTrack hue={hue} onChange={onChange} />
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={variant === 'swatch' ? `Your color: ${color}` : 'Choose draw hue'}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={
            variant === 'swatch'
              ? 'h-5 w-5 rounded-full border border-slate-500'
              : 'h-5 w-5 shrink-0 rounded-full border border-slate-600'
          }
          style={{ backgroundColor: color }}
          aria-hidden
        />
        {variant === 'button' && 'Hue'}
      </button>
      {popover}
    </>
  );
}
