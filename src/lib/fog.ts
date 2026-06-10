import type { FogState } from './types';

/** No fog overlay — map fully visible to GM and players. */
export function isFogFullyClear(fog: FogState): boolean {
  return (
    !fog.defaultHidden &&
    fog.unexploredMask.length === 0 &&
    fog.revealedMask.length === 0
  );
}

/** Drop full-fog mode when nothing is hidden anymore. */
export function normalizeFogState(fog: FogState): FogState {
  if (fog.defaultHidden && fog.unexploredMask.length === 0) {
    return { ...fog, defaultHidden: false };
  }
  return fog;
}
