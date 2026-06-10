import { useEffect, useRef, useState } from 'react';

const TARGET_CELL_PX = 13;
const LINE_WIDTH = 1;

type GridLayout = {
  cell: number;
  cols: number;
  rows: number;
  offsetX: number;
  offsetY: number;
  gridW: number;
  gridH: number;
};

function layoutSquareGrid(width: number, height: number): GridLayout | null {
  if (width < 8 || height < 8) return null;
  const cols = Math.max(2, Math.round(width / TARGET_CELL_PX));
  const rows = Math.max(2, Math.round(height / TARGET_CELL_PX));
  const cell = Math.min(width / cols, height / rows);
  const gridW = cell * cols;
  const gridH = cell * rows;
  return {
    cell,
    cols,
    rows,
    offsetX: (width - gridW) / 2,
    offsetY: (height - gridH) / 2,
    gridW,
    gridH,
  };
}

export function SquareGridOverlay({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = layoutSquareGrid(size.width, size.height);

  return (
    <span ref={ref} className={`absolute inset-0 ${className}`} aria-hidden>
      {layout && (
        <svg
          className="block h-full w-full"
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
        >
          {Array.from({ length: layout.cols + 1 }, (_, i) => {
            const x = layout.offsetX + i * layout.cell;
            return (
              <line
                key={`v-${i}`}
                x1={x}
                y1={layout.offsetY}
                x2={x}
                y2={layout.offsetY + layout.gridH}
                stroke="currentColor"
                strokeWidth={LINE_WIDTH}
              />
            );
          })}
          {Array.from({ length: layout.rows + 1 }, (_, j) => {
            const y = layout.offsetY + j * layout.cell;
            return (
              <line
                key={`h-${j}`}
                x1={layout.offsetX}
                y1={y}
                x2={layout.offsetX + layout.gridW}
                y2={y}
                stroke="currentColor"
                strokeWidth={LINE_WIDTH}
              />
            );
          })}
        </svg>
      )}
    </span>
  );
}
