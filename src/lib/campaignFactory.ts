import { newId } from './ids';
import type { Campaign, Scene } from './types';
import { DEFAULT_FOG } from './types';

export function createScene(name: string): Scene {
  return {
    id: newId(),
    name,
    maps: [],
    tokens: [],
    fog: {
      ...DEFAULT_FOG,
      unexploredMask: [],
      revealedMask: [],
    },
    measurements: [],
    drawStrokes: [],
    gridOffset: { x: 0, y: 0 },
  };
}

export function createCampaign(name: string): Campaign {
  const scene = createScene('Scene 1');
  const now = Date.now();
  return {
    id: newId(),
    name,
    version: 2,
    sceneDeck: [{ type: 'scene', sceneId: scene.id }],
    scenes: { [scene.id]: scene },
    lastActiveSceneId: scene.id,
    createdAt: now,
    updatedAt: now,
  };
}

export const TOKEN_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];
