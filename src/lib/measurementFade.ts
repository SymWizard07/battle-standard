import type { SceneId } from './types';

const FADE_STEP = 0.08;
const FADE_INTERVAL_MS = 32;

type FadeEngine = {
  onOpacity: (updates: Record<string, number | null>) => void;
  onRemove: (sceneId: SceneId, ids: string[]) => void;
};

let engine: FadeEngine | null = null;

const fading = new Map<string, { sceneId: SceneId; opacity: number }>();
let ticker: ReturnType<typeof setInterval> | null = null;

export function setMeasurementFadeEngine(next: FadeEngine): void {
  engine = next;
}

function stopTickerIfEmpty(): void {
  if (fading.size === 0 && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function tick(): void {
  if (!engine || fading.size === 0) {
    stopTickerIfEmpty();
    return;
  }

  const updates: Record<string, number | null> = {};
  const removesByScene = new Map<SceneId, string[]>();

  for (const [id, entry] of fading.entries()) {
    const next = entry.opacity - FADE_STEP;
    if (next <= 0) {
      updates[id] = null;
      fading.delete(id);
      const list = removesByScene.get(entry.sceneId) ?? [];
      list.push(id);
      removesByScene.set(entry.sceneId, list);
    } else {
      entry.opacity = next;
      updates[id] = next;
    }
  }

  if (Object.keys(updates).length > 0) {
    engine.onOpacity(updates);
  }
  for (const [sceneId, ids] of removesByScene) {
    if (ids.length > 0) engine.onRemove(sceneId, ids);
  }

  stopTickerIfEmpty();
}

function ensureTicker(): void {
  if (ticker) return;
  ticker = setInterval(tick, FADE_INTERVAL_MS);
}

export function startMeasurementFade(sceneId: SceneId, id: string): void {
  if (fading.has(id)) return;
  fading.set(id, { sceneId, opacity: 1 });
  ensureTicker();
}

export function clearAllMeasurementFadeTimers(): void {
  fading.clear();
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}
