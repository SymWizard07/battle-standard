import type { Point } from '../lib/types';
import { ROTATE_HANDLE_PX } from '../lib/rotationHandle';

type Props = {
  attachPoint: Point;
  handlePoint: Point;
  onPointerDown: (e: React.PointerEvent) => void;
};

function RotateHandleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function RotationHandleControl({
  attachPoint,
  handlePoint,
  onPointerDown,
}: Props) {
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        aria-hidden
      >
        <line
          x1={attachPoint.x}
          y1={attachPoint.y}
          x2={handlePoint.x}
          y2={handlePoint.y}
          stroke="rgb(56 189 248 / 0.95)"
          strokeWidth={2}
        />
      </svg>
      <div
        className="pointer-events-auto absolute touch-none cursor-grab rounded-full border-2 border-white bg-sky-500 text-white shadow-md active:cursor-grabbing"
        style={{
          left: handlePoint.x,
          top: handlePoint.y,
          width: ROTATE_HANDLE_PX,
          height: ROTATE_HANDLE_PX,
          transform: 'translate(-50%, -50%)',
        }}
        title="Drag to rotate"
        aria-label="Drag to rotate"
        role="button"
        tabIndex={-1}
        onPointerDown={onPointerDown}
      >
        <div className="flex h-full w-full items-center justify-center">
          <RotateHandleIcon />
        </div>
      </div>
    </>
  );
}
