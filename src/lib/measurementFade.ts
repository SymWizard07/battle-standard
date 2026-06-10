import type { SceneId } from './types';

const FADE_STEP = 0.08;
const FADE_INTERVAL_MS = 32;

const timers = new Map<string, ReturnType<typeof setInterval>>();

type FadeCallbacks = {
  onOpacity: (id: string, opacity: number | null) => void;
  onRemove: (sceneId: SceneId, id: string) => void;
};

export function startMeasurementFade(
  sceneId: SceneId,
  id: string,
  callbacks: FadeCallbacks,
): void {
  if (timers.has(id)) return;

  let op = 1;
  const timer = setInterval(() => {
    op -= FADE_STEP;
    if (op <= 0) {
      clearInterval(timer);
      timers.delete(id);
      callbacks.onOpacity(id, null);
      callbacks.onRemove(sceneId, id);
      return;
    }
    callbacks.onOpacity(id, op);
  }, FADE_INTERVAL_MS);
  timers.set(id, timer);
}

export function clearAllMeasurementFadeTimers(): void {
  for (const timer of timers.values()) {
    clearInterval(timer);
  }
  timers.clear();
}
