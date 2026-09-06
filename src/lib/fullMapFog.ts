import type { Scene } from './types';

/** Full-grid fog: hide everything by default; paint ops reveal/hide on top. */
export function applyFullMapFog(scene: Scene): Scene {
  return {
    ...scene,
    fog: { defaultHidden: true, ops: [] },
  };
}

export function removeFullMapFog(scene: Scene): Scene {
  return {
    ...scene,
    fog: { defaultHidden: false, ops: [] },
  };
}
