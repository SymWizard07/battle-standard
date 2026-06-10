import { DEFAULT_GRID_OFFSET } from '../lib/fixedGrid';
import { tokenWorldTopLeft } from '../lib/grid';
import {
  drawStrokesEqual,
  interpolateDrawStroke,
  interpolateEphemeralMeasurement,
  interpolateFootprint,
  interpolateTokenPlacement,
  MOTION_CATCHUP_BLEND,
  MOTION_INTERPOLATION_DELAY_MS,
  placementsEqual,
} from '../lib/motionInterp';
import { deepEqual } from '../lib/history/equal';
import type {
  DrawStroke,
  EphemeralMeasurement,
  Point,
  Scene,
  SceneId,
  Token,
  TokenGridPlacement,
} from '../lib/types';
import type { CampaignLiveSync } from './liveSyncPayload';
import { useStore } from '../store/useStore';

type Sample<T> = { value: T; time: number };

type MotionTrack<T> = {
  samples: Sample<T>[];
  display: T | null;
};

export type RemoteEphemeralMeasure = {
  measure: EphemeralMeasurement;
  color: string;
};

export type RemoteMotionDisplay = {
  tokenPlacements: Record<string, TokenGridPlacement>;
  tokenFootprints: Record<string, { w: number; h: number }>;
  drawStrokes: Record<string, DrawStroke>;
  ephemeralMeasure: RemoteEphemeralMeasure | null;
};

type TokenMotionValue = {
  placement: TokenGridPlacement;
  footprint: { w: number; h: number };
};

const MAX_SAMPLE_AGE_MS = 2500;
const SNAP_WORLD_PX = 0.75;

let tokenTracks = new Map<string, MotionTrack<TokenMotionValue>>();
let strokeTracks = new Map<string, MotionTrack<DrawStroke>>();
let ephemeralTrack: MotionTrack<EphemeralMeasurement> | null = null;
let ephemeralColor = '#94a3b8';
let rafId: number | null = null;
let listeners = new Set<() => void>();
let display: RemoteMotionDisplay = {
  tokenPlacements: {},
  tokenFootprints: {},
  drawStrokes: {},
  ephemeralMeasure: null,
};

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function trimSamples<T>(samples: Sample<T>[], now: number): Sample<T>[] {
  const out = [...samples];
  while (out.length > 2 && out[0]!.time < now - MAX_SAMPLE_AGE_MS) {
    out.shift();
  }
  return out;
}

function pushSample<T>(
  track: MotionTrack<T>,
  value: T,
  time: number,
  equal: (a: T, b: T) => boolean,
): void {
  const last = track.samples[track.samples.length - 1];
  if (last && equal(last.value, value)) return;
  track.samples = trimSamples([...track.samples, { value, time }], time);
  if (track.display == null) {
    track.display = value;
  }
}

function interpolateAtTime<T>(
  track: MotionTrack<T>,
  now: number,
  blend: (a: T, b: T, t: number) => T,
): T | null {
  if (track.samples.length === 0) return track.display;

  const playback = now - MOTION_INTERPOLATION_DELAY_MS;
  const first = track.samples[0]!;
  const last = track.samples[track.samples.length - 1]!;

  if (playback <= first.time) {
    return first.value;
  }

  if (playback >= last.time) {
    const current = track.display ?? last.value;
    return blend(current, last.value, MOTION_CATCHUP_BLEND);
  }

  for (let i = 0; i < track.samples.length - 1; i++) {
    const s0 = track.samples[i]!;
    const s1 = track.samples[i + 1]!;
    if (playback >= s0.time && playback <= s1.time) {
      const span = Math.max(1, s1.time - s0.time);
      const alpha = (playback - s0.time) / span;
      return blend(s0.value, s1.value, alpha);
    }
  }

  return last.value;
}

function tokenMotionEqual(a: TokenMotionValue, b: TokenMotionValue): boolean {
  return (
    placementsEqual(a.placement, b.placement) &&
    a.footprint.w === b.footprint.w &&
    a.footprint.h === b.footprint.h
  );
}

function tokenValueFrom(token: Token): TokenMotionValue {
  return {
    placement: {
      gridPos: { ...token.gridPos },
      posOffset: token.posOffset ? { ...token.posOffset } : undefined,
    },
    footprint: { ...token.footprint },
  };
}

function tokenChanged(prev: Token, next: Token): boolean {
  return !tokenMotionEqual(tokenValueFrom(prev), tokenValueFrom(next));
}

function localDragExclusions(): {
  tokenIds: Set<string>;
  strokeIds: Set<string>;
} {
  const state = useStore.getState();
  const tokenIds = new Set<string>();
  for (const id of Object.keys(state.movePreviewPositions ?? {})) {
    tokenIds.add(id);
  }
  for (const id of Object.keys(state.scalePreviewById ?? {})) {
    tokenIds.add(id);
  }
  const strokeIds = new Set<string>();
  if (state.drawStrokeDragPreview) {
    for (const stroke of state.drawStrokeDragPreview) {
      strokeIds.add(stroke.id);
    }
  }
  return { tokenIds, strokeIds };
}

function placementWorldDistance(a: TokenGridPlacement, b: TokenGridPlacement, gridOffset: Point): number {
  const wa = tokenWorldTopLeft(a, gridOffset);
  const wb = tokenWorldTopLeft(b, gridOffset);
  const dx = wa.x - wb.x;
  const dy = wa.y - wb.y;
  return Math.hypot(dx, dy);
}

export function feedRemoteSceneMotion(
  sceneId: SceneId | null | undefined,
  prevScene: Scene | undefined,
  remoteScene: Scene | undefined,
  liveSync: CampaignLiveSync | undefined,
): void {
  if (!sceneId || !remoteScene) return;
  const now = Date.now();
  const { tokenIds: localTokens, strokeIds: localStrokes } = localDragExclusions();

  const prevTokens = new Map((prevScene?.tokens ?? []).map((t) => [t.id, t]));
  for (const token of remoteScene.tokens) {
    if (localTokens.has(token.id)) continue;
    const prev = prevTokens.get(token.id);
    if (prev && !tokenChanged(prev, token)) continue;

    let track = tokenTracks.get(token.id);
    if (!track) {
      track = { samples: [], display: prev ? tokenValueFrom(prev) : tokenValueFrom(token) };
      tokenTracks.set(token.id, track);
    }
    pushSample(track, tokenValueFrom(token), now, tokenMotionEqual);
  }

  const prevStrokes = new Map((prevScene?.drawStrokes ?? []).map((s) => [s.id, s]));
  for (const stroke of remoteScene.drawStrokes ?? []) {
    if (localStrokes.has(stroke.id)) continue;
    const prev = prevStrokes.get(stroke.id);
    if (prev && drawStrokesEqual(prev, stroke)) continue;

    let track = strokeTracks.get(stroke.id);
    if (!track) {
      track = { samples: [], display: prev ?? stroke };
      strokeTracks.set(stroke.id, track);
    }
    pushSample(track, stroke, now, drawStrokesEqual);
  }

  if (liveSync && liveSync.sceneId === sceneId) {
    if (liveSync.sessionColor) ephemeralColor = liveSync.sessionColor;
    if (liveSync.ephemeralMeasure === null) {
      ephemeralTrack = null;
    } else if (liveSync.ephemeralMeasure) {
      if (!ephemeralTrack) {
        ephemeralTrack = { samples: [], display: liveSync.ephemeralMeasure };
      }
      pushSample(
        ephemeralTrack,
        liveSync.ephemeralMeasure,
        now,
        (a, b) => deepEqual(a, b),
      );
    }
  }
}

function rebuildDisplay(now: number, gridOffset: Point): void {
  const tokenPlacements: Record<string, TokenGridPlacement> = {};
  const tokenFootprints: Record<string, { w: number; h: number }> = {};
  const drawStrokes: Record<string, DrawStroke> = {};

  for (const [id, track] of tokenTracks) {
    const value = interpolateAtTime(track, now, (a, b, t) => ({
      placement: interpolateTokenPlacement(a.placement, b.placement, t, gridOffset),
      footprint: interpolateFootprint(a.footprint, b.footprint, t),
    }));
    if (!value) continue;
    const last = track.samples[track.samples.length - 1]?.value;
    if (
      last &&
      placementWorldDistance(value.placement, last.placement, gridOffset) < SNAP_WORLD_PX &&
      value.footprint.w === last.footprint.w &&
      value.footprint.h === last.footprint.h
    ) {
      tokenTracks.delete(id);
      continue;
    }
    tokenPlacements[id] = value.placement;
    tokenFootprints[id] = value.footprint;
    track.display = value;
  }

  for (const [id, track] of strokeTracks) {
    const value = interpolateAtTime(track, now, (a, b, t) =>
      interpolateDrawStroke(a, b, t, gridOffset),
    );
    if (!value) continue;
    const last = track.samples[track.samples.length - 1]?.value;
    if (last && drawStrokesEqual(value, last)) {
      strokeTracks.delete(id);
      continue;
    }
    drawStrokes[id] = value;
    track.display = value;
  }

  let ephemeralMeasure: RemoteEphemeralMeasure | null = null;
  if (ephemeralTrack && ephemeralTrack.samples.length > 0) {
    const value = interpolateAtTime(ephemeralTrack, now, interpolateEphemeralMeasurement);
    if (value) {
      ephemeralMeasure = { measure: value, color: ephemeralColor };
      ephemeralTrack.display = value;
    }
  }

  display = { tokenPlacements, tokenFootprints, drawStrokes, ephemeralMeasure };
}

function tick(now: number): void {
  const scene = useStore.getState().campaign?.scenes[useStore.getState().activeSceneId ?? ''];
  const gridOffset = scene?.gridOffset ?? DEFAULT_GRID_OFFSET;
  rebuildDisplay(now, gridOffset);
  notify();
  rafId = requestAnimationFrame(tick);
}

export function startRemoteMotion(): void {
  if (rafId != null) return;
  rafId = requestAnimationFrame(tick);
}

export function stopRemoteMotion(): void {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  tokenTracks.clear();
  strokeTracks.clear();
  ephemeralTrack = null;
  display = {
    tokenPlacements: {},
    tokenFootprints: {},
    drawStrokes: {},
    ephemeralMeasure: null,
  };
  notify();
}

export function getRemoteMotionDisplay(): RemoteMotionDisplay {
  return display;
}

export function subscribeRemoteMotion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
