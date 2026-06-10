import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import { TEMPLATE_TOKEN_ICON_SOURCES } from '../../lib/templateTokenIconSources';
import { DEFAULT_FLY_MS, ScatteredFlyingToken } from './ScatteredFlyingToken';

/** Matches HomePage frost shell: min(calc(100% - 2rem), calc(32rem + 3rem)). */
const FROST_MAX_WIDTH_PX = 35 * 16;
const FROST_VIEWPORT_GUTTER_PX = 32;

const ALL_TEMPLATE_COLORS = TEMPLATE_TOKEN_ICON_SOURCES.map((s) => s.templateColor);
const TOKENS_PER_MARGIN = 12;
const TOKENS_IN_FROST = 16;
const ARRIVAL_MS = 4000;

type TokenPlacement = {
  col: number;
  row: number;
  templateColor: string;
  opacity: number;
};

type GridSlot = { col: number; row: number };

function frostPanelWidthPx(viewportWidth: number): number {
  return Math.min(viewportWidth - FROST_VIEWPORT_GUTTER_PX, FROST_MAX_WIDTH_PX);
}

function frostColumnBounds(viewportWidth: number) {
  const frostWidth = frostPanelWidthPx(viewportWidth);
  const frostLeft = (viewportWidth - frostWidth) / 2;
  return { frostLeft, frostRight: frostLeft + frostWidth };
}

/** True when any part of the token cell intersects the viewport. */
function isPartiallyOnScreen(
  leftPx: number,
  topPx: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    leftPx + GRID_SIZE_PX > 0 &&
    leftPx < viewportWidth &&
    topPx + GRID_SIZE_PX > 0 &&
    topPx < viewportHeight
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function assignColors(count: number): string[] {
  if (count === 0) return [];

  const shuffled = shuffle(ALL_TEMPLATE_COLORS);
  if (count >= ALL_TEMPLATE_COLORS.length) {
    const pool = [...shuffled];
    for (let i = ALL_TEMPLATE_COLORS.length; i < count; i++) {
      pool.push(shuffled[i % shuffled.length]!);
    }
    return shuffle(pool);
  }
  return shuffled.slice(0, count);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function gridChebyshevDistance(a: GridSlot, b: GridSlot): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

type OrganicPickOptions = {
  count: number;
  minSeparation: number;
  clusterChance: number;
};

function pickOrganicSlots(slots: GridSlot[], options: OrganicPickOptions): GridSlot[] {
  const { count, minSeparation, clusterChance } = options;
  const target = Math.min(count, slots.length);
  if (target === 0) return [];
  if (target === slots.length) return shuffle(slots);

  const bandSize = 3 + Math.floor(Math.random() * 3);
  const bands = new Map<number, GridSlot[]>();
  for (const slot of slots) {
    const band = Math.floor(slot.row / bandSize);
    const list = bands.get(band) ?? [];
    list.push(slot);
    bands.set(band, list);
  }
  const bandOrder = shuffle([...bands.keys()]);
  const extraBands = shuffle(bandOrder).slice(0, Math.min(2, bandOrder.length));
  const candidates = shuffle([
    ...bandOrder.flatMap((band) => shuffle(bands.get(band) ?? [])),
    ...extraBands.flatMap((band) => shuffle(bands.get(band) ?? [])),
  ]);

  const picked: GridSlot[] = [];
  const occupied = new Set<string>();
  const slotKey = (s: GridSlot) => `${s.col},${s.row}`;

  const nearestDistance = (slot: GridSlot): number => {
    if (picked.length === 0) return Infinity;
    return Math.min(...picked.map((p) => gridChebyshevDistance(p, slot)));
  };

  const tryPlace = (slot: GridSlot, relax: boolean): boolean => {
    if (occupied.has(slotKey(slot))) return false;
    const nearest = nearestDistance(slot);
    const jitter = Math.random() < 0.45 ? Math.floor(Math.random() * 2) : 0;
    const threshold = relax ? 1 : minSeparation + jitter;
    const allowCluster = nearest >= 1 && Math.random() < clusterChance;
    if (nearest >= threshold || allowCluster) {
      picked.push(slot);
      occupied.add(slotKey(slot));
      return true;
    }
    return false;
  };

  for (const slot of candidates) {
    if (picked.length >= target) break;
    tryPlace(slot, false);
  }

  for (const slot of shuffle(slots)) {
    if (picked.length >= target) break;
    tryPlace(slot, true);
  }

  if (picked.length < target && Math.random() < 0.7) {
    const anchor = picked[Math.floor(Math.random() * picked.length)]!;
    const neighbors = shuffle(
      slots.filter((s) => {
        const d = gridChebyshevDistance(anchor, s);
        return d >= 1 && d <= 2 && !occupied.has(slotKey(s));
      }),
    );
    for (const n of neighbors) {
      if (picked.length >= target) break;
      picked.push(n);
      occupied.add(slotKey(n));
    }
  }

  return picked.slice(0, target);
}

function generateRandomPlacements(viewportWidth: number, viewportHeight: number): TokenPlacement[] {
  const { frostLeft, frostRight } = frostColumnBounds(viewportWidth);
  const maxRow = Math.floor((viewportHeight - 1) / GRID_SIZE_PX);
  const maxColIndex = Math.floor((viewportWidth - 1) / GRID_SIZE_PX);
  const minRow = 0;
  const maxRowIndex = maxRow;
  const minCol = 0;
  const maxCol = maxColIndex;

  const maxColLeft = Math.floor((frostLeft - 1) / GRID_SIZE_PX);
  const minColRight = Math.ceil(frostRight / GRID_SIZE_PX);
  const centerMinCol = Math.ceil(frostLeft / GRID_SIZE_PX);
  const centerMaxCol = Math.floor((frostRight - GRID_SIZE_PX) / GRID_SIZE_PX);

  if (maxRowIndex < 0 || maxCol < 0) return [];

  const leftSlots: GridSlot[] = [];
  for (let col = minCol; col <= Math.min(maxColLeft, maxCol); col++) {
    for (let row = minRow; row <= maxRowIndex; row++) {
      leftSlots.push({ col, row });
    }
  }

  const centerSlots: GridSlot[] = [];
  if (centerMinCol <= centerMaxCol) {
    for (let col = centerMinCol; col <= centerMaxCol; col++) {
      for (let row = minRow; row <= maxRowIndex; row++) {
        centerSlots.push({ col, row });
      }
    }
  }

  const rightSlots: GridSlot[] = [];
  for (let col = Math.max(minColRight, minCol); col <= maxCol; col++) {
    for (let row = minRow; row <= maxRowIndex; row++) {
      rightSlots.push({ col, row });
    }
  }

  const leftTarget = TOKENS_PER_MARGIN + randomInt(-4, 5);
  const centerTarget = TOKENS_IN_FROST + randomInt(-5, 6);
  const rightTarget = TOKENS_PER_MARGIN + randomInt(-4, 5);

  const leftPicks = pickOrganicSlots(leftSlots, {
    count: leftTarget,
    minSeparation: 2,
    clusterChance: 0.28,
  });
  const centerPicks = pickOrganicSlots(centerSlots, {
    count: centerTarget,
    minSeparation: 2,
    clusterChance: 0.35,
  });
  const rightPicks = pickOrganicSlots(rightSlots, {
    count: rightTarget,
    minSeparation: 2,
    clusterChance: 0.28,
  });
  const allPicks = [...leftPicks, ...centerPicks, ...rightPicks];
  const colors = assignColors(allPicks.length);

  return allPicks.map((slot, i) => ({
    col: slot.col,
    row: slot.row,
    templateColor: colors[i]!,
    opacity: 0.75 + Math.random() * 0.22,
  }));
}

/** Template tokens scattered on the landing page grid (margins + frosted column). */
export function ScatteredGridTokens() {
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 768,
  );

  const [placements] = useState(() =>
    typeof window !== 'undefined'
      ? generateRandomPlacements(window.innerWidth, window.innerHeight)
      : [],
  );

  const visible = useMemo(
    () =>
      placements.filter((token) => {
        const left = token.col * GRID_SIZE_PX;
        const top = token.row * GRID_SIZE_PX;
        return isPartiallyOnScreen(left, top, viewportWidth, viewportHeight);
      }),
    [placements, viewportWidth, viewportHeight],
  );

  const flyOrder = useMemo(
    () => shuffle(visible.map((_, index) => index)),
    [visible],
  );

  const mountTimeRef = useRef(Date.now());
  const [animating, setAnimating] = useState<Set<number>>(() => new Set());
  const [flyDurations, setFlyDurations] = useState<Map<number, number>>(() => new Map());
  const loadedRef = useRef(new Set<number>());
  const waitersRef = useRef<Map<number, () => void>>(new Map());

  const markLoaded = useCallback((index: number) => {
    loadedRef.current.add(index);
    const waiter = waitersRef.current.get(index);
    if (waiter) {
      waitersRef.current.delete(index);
      waiter();
    }
  }, []);

  const startFly = useCallback((index: number) => {
    const elapsed = Date.now() - mountTimeRef.current;
    const remaining = ARRIVAL_MS - elapsed;
    const duration = Math.max(120, Math.min(DEFAULT_FLY_MS, remaining));

    setFlyDurations((prev) => {
      const next = new Map(prev);
      next.set(index, duration);
      return next;
    });
    setAnimating((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const triggerFly = useCallback(
    (index: number) => {
      if (loadedRef.current.has(index)) {
        startFly(index);
        return;
      }
      waitersRef.current.set(index, () => startFly(index));
    },
    [startFly],
  );

  useLayoutEffect(() => {
    const update = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    mountTimeRef.current = Date.now();
    const n = flyOrder.length;
    if (n === 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let seq = 0; seq < n; seq++) {
      const index = flyOrder[seq]!;
      const startDelay =
        (seq * (ARRIVAL_MS - DEFAULT_FLY_MS)) / Math.max(n - 1, 1);

      timers.push(
        setTimeout(() => {
          triggerFly(index);
        }, startDelay),
      );
    }

    return () => {
      for (const timer of timers) clearTimeout(timer);
      waitersRef.current.clear();
    };
  }, [flyOrder, triggerFly]);

  if (visible.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
      {visible.map((token, index) => {
        const left = token.col * GRID_SIZE_PX;
        const top = token.row * GRID_SIZE_PX;

        return (
          <div
            key={`${token.col}-${token.row}-${token.templateColor}`}
            className="absolute"
            style={{
              left,
              top,
              width: GRID_SIZE_PX,
              height: GRID_SIZE_PX,
            }}
          >
            <ScatteredFlyingToken
              templateColor={token.templateColor}
              opacity={token.opacity}
              left={left}
              top={top}
              animate={animating.has(index)}
              flyDurationMs={flyDurations.get(index) ?? DEFAULT_FLY_MS}
              onLoaded={() => markLoaded(index)}
            />
          </div>
        );
      })}
    </div>
  );
}
