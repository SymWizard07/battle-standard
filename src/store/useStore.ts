import { create } from 'zustand';
import { canEditToken } from '../sync/yjsProvider';
import { createCampaign, createScene, TOKEN_COLORS } from '../lib/campaignFactory';
import { colorForPlayerName, defaultPlayerColor, hueForPlayerName, snapHue } from '../lib/playerColor';
import { isMapAssetId } from '../lib/campaignAssets';
import { saveCampaign, loadCampaignAssets, loadTokenLibraryLayout, saveTokenLibraryLayout, deleteAsset, saveAsset } from '../lib/db';
import { isTokenLibraryAsset, mapAssetIdsInCampaign } from '../lib/campaignAssets';
import { newId } from '../lib/ids';
import { loadImageDimensions } from '../lib/mapAlign';
import { bringMapLayerToFront as reorderMapLayerToFront, migrateSceneMaps, offsetMapTransform, sceneMaps } from '../lib/sceneMaps';
import { applyFullMapFog, removeFullMapFog } from '../lib/fullMapFog';
import { normalizeFogState } from '../lib/fog';
import { computeMapsCentroid, recenterSceneGrid } from '../lib/gridRecenter';
import { DEFAULT_GRID_OFFSET, setGridOffset } from '../lib/fixedGrid';
import { quantizeGridSnapStrength } from '../lib/gridSnap';
import {
  currentMeasurementPinnedBy,
  measurementsOwnedBySessionUser,
} from '../lib/measureOwnership';
import { startMeasurementFade } from '../lib/measurementFade';
import { computeMapBounds, frameMapBoundsInViewport } from '../lib/sceneBounds';
import {
  applyMapTransformToSceneChildren,
  assignDrawStrokeMapLayer,
  assignFogPolygonMapLayer,
  assignMeasurementMapLayer,
  assignTokenMapLayer,
  mergeMapTransform,
  reassignAllObjectMapParents,
  reassignChildrenAfterMapRemoved,
  tokenAnchorWorld,
  resolveMapLayerForWorldPoint,
} from '../lib/mapObjectParent';
import {
  clampDrawStrokeWidth,
  DRAW_STROKE_WIDTH_DEFAULT,
} from '../lib/drawConstants';
import {
  duplicateDrawStrokes,
  duplicateMeasurements,
  duplicateTokens,
} from '../lib/duplicateSelection';
import {
  footprintForImagePixels,
  gridPosForTokenCenteredAtScreen,
  loadBlobImageSize,
} from '../lib/pasteTokenImage';
import polygonClipping from 'polygon-clipping';
import type { Rect } from '../lib/rectOps';
import type {
  AssetId,
  Campaign,
  DrawPreview,
  DrawStroke,
  DrawToolShape,
  EphemeralMeasurement,
  FogPolygon,
  FogPreview,
  InteractionMode,
  MapTransform,
  MeasureKind,
  MeasurementObject,
  MeasurementParams,
  MeasureDisplayStyle,
  Point,
  Scene,
  SceneId,
  SessionRole,
  StatusEffectId,
  SyncStatus,
  Token,
  TokenGridPlacement,
  TokenLibraryDropPayload,
  TokenLibraryLayout,
  TokenVitalityState,
  ToolMode,
  SceneEditMode,
} from '../lib/types';
import { DEFAULT_FOG, GLOBAL_CAMPAIGN_ID } from '../lib/types';
import {
  addTokenDropToGroup,
  defaultTokenLibraryLayout,
  migrateTokenLibraryLayout,
  removeImportGroupEntries,
  removeEntry,
  moveLibraryEntryToGroup,
  copyTemplatePresetToGroup,
} from '../lib/tokenLibrary';
import {
  cloneSnapshot,
  createInitialHistoryState,
  deepEqual,
  diffCampaign,
  diffScene,
  isHistorySuppressed,
  performRedo,
  performUndo,
  pushHistoryEntry,
  type EditHistoryState,
  type HistoryEntry,
} from '../lib/history';

interface ViewportState {
  scale: number;
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Live pan/zoom while the map gesture is in progress (before commit to x/y/scale). */
  gestureViewport: { x: number; y: number; scale: number } | null;
  setViewport: (v: Partial<Pick<ViewportState, 'scale' | 'x' | 'y'>>) => void;
  setViewportSize: (width: number, height: number) => void;
  setGestureViewport: (v: { x: number; y: number; scale: number } | null) => void;
  resetViewport: () => void;
}

interface ToolState {
  activeTool: ToolMode;
  sceneEditMode: SceneEditMode;
  selectedMapLayerId: string | null;
  measureKind: MeasureKind;
  measurePinMode: boolean;
  fogBrushCells: number;
  fogMode: 'hide' | 'reveal';
  fogShape: 'stroke' | 'rect' | 'cone' | 'sphere';
  alternatingDiagonals: boolean;
  coneAngleDeg: number;
  measureDisplayStyle: MeasureDisplayStyle;
  /** Debug: draw VTT smooth shape and 5e grid highlight together. */
  measureDebugDualView: boolean;
  fogPreview: FogPreview | null;
  /** GM fog tool: render hidden fog opaque (player-like) without full player view. */
  fogOpaquePreview: boolean;
  mapEditDragging: boolean;
  gridVisible: boolean;
  selectSnap: number; // 0..1, rounded to discrete slider steps
  selectDrawShapes: boolean;
  drawShape: DrawToolShape;
  drawHue: number;
  drawStrokeWidth: number;
  drawPreview: DrawPreview | null;
  setTool: (tool: ToolMode) => void;
  setSceneEditMode: (mode: SceneEditMode) => void;
  setSelectedMapLayerId: (id: string | null) => void;
  setMeasureKind: (k: MeasureKind) => void;
  setMeasurePinMode: (v: boolean) => void;
  setFogBrushCells: (n: number) => void;
  setFogMode: (mode: 'hide' | 'reveal') => void;
  setFogShape: (shape: 'stroke' | 'rect' | 'cone' | 'sphere') => void;
  setAlternatingDiagonals: (v: boolean) => void;
  setConeAngleDeg: (v: number) => void;
  setMeasureDisplayStyle: (style: MeasureDisplayStyle) => void;
  toggleMeasureDisplayStyle: () => void;
  setMeasureDebugDualView: (v: boolean) => void;
  setFogPreview: (p: FogPreview | null) => void;
  setFogOpaquePreview: (v: boolean) => void;
  setMapEditDragging: (v: boolean) => void;
  setGridVisible: (v: boolean) => void;
  setSelectSnap: (v: number) => void;
  setSelectDrawShapes: (v: boolean) => void;
  setDrawShape: (shape: DrawToolShape) => void;
  setDrawHue: (hue: number) => void;
  setDrawStrokeWidth: (width: number) => void;
  setDrawPreview: (preview: DrawPreview | null) => void;
}

interface SelectionState {
  selectedTokenIds: string[];
  selectedMeasurementId: string | null;
  selectedDrawStrokeIds: string[];
  interactionMode: InteractionMode;
  movePreviewPos: TokenGridPlacement | null;
  movePreviewPositions: Record<string, TokenGridPlacement> | null;
  scalePreviewById: Record<
    string,
    { footprint: { w: number; h: number }; placement: TokenGridPlacement }
  > | null;
  drawStrokeDragPreview: DrawStroke[] | null;
  ephemeralMeasure: EphemeralMeasurement | null;
  fadingMeasurements: Record<string, number>;
  selectToken: (id: string, opts?: { additive?: boolean }) => void;
  selectTokens: (ids: string[]) => void;
  toggleTokenInSelection: (id: string) => void;
  selectMeasurement: (id: string | null) => void;
  selectDrawStroke: (id: string | null) => void;
  selectDrawStrokes: (ids: string[]) => void;
  toggleDrawStrokeInSelection: (id: string) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  setMovePreview: (pos: TokenGridPlacement | null) => void;
  setMovePreviewPositions: (positions: Record<string, TokenGridPlacement> | null) => void;
  setScalePreviewById: (
    previews: Record<
      string,
      { footprint: { w: number; h: number }; placement: TokenGridPlacement }
    > | null,
  ) => void;
  startTokenScale: () => void;
  cancelTokenScale: () => void;
  commitTokenScale: (sceneId: SceneId) => void;
  setDrawStrokeDragPreview: (strokes: DrawStroke[] | null) => void;
  setEphemeralMeasure: (m: EphemeralMeasurement | null) => void;
  fadeAndRemoveMeasurement: (sceneId: SceneId, id: string) => void;
  fadeAndRemoveMeasurementsForCurrentUser: (sceneId: SceneId) => void;
  clearSelection: () => void;
  duplicateSelection: (sceneId: SceneId) => boolean;
  deleteSelection: (sceneId: SceneId) => boolean;
}

export function primarySelectedTokenId(ids: string[]): string | null {
  return ids.length > 0 ? ids[ids.length - 1]! : null;
}

export function getMovingTokenDropPayloads(
  campaign: Campaign | null,
  activeSceneId: SceneId | null,
  movePreviewPositions: Record<string, TokenGridPlacement> | null,
  selectedTokenIds: string[],
): TokenLibraryDropPayload[] {
  if (!campaign || !activeSceneId) return [];
  const scene = campaign.scenes[activeSceneId];
  if (!scene) return [];
  const ids = movePreviewPositions ? Object.keys(movePreviewPositions) : selectedTokenIds;
  const payloads: TokenLibraryDropPayload[] = [];
  for (const id of ids) {
    const token = scene.tokens.find((t) => t.id === id);
    if (token && canEditToken(token)) {
      payloads.push({
        tokenId: token.id,
        name: token.name,
        color: token.color,
        imageAssetId: token.imageAssetId,
        footprint: { ...token.footprint },
      });
    }
  }
  return payloads;
}

interface UiState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  scenePreviewUrls: Record<string, string>;
  setScenePreviewUrl: (sceneId: SceneId, dataUrl: string) => void;
  setLeftCollapsed: (v: boolean) => void;
  setRightCollapsed: (v: boolean) => void;
}

interface SessionState {
  role: SessionRole;
  /** GM-only preview of what players see (does not affect sync role). */
  playerView: boolean;
  roomCode: string | null;
  playerName: string;
  syncStatus: SyncStatus;
  peerCount: number;
  reconnecting: boolean;
  setRole: (role: SessionRole) => void;
  setPlayerView: (v: boolean) => void;
  setRoomCode: (code: string | null) => void;
  setPlayerName: (name: string) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setPeerCount: (n: number) => void;
  setReconnecting: (v: boolean) => void;
}

export function seesAsPlayer(role: SessionRole, playerView: boolean): boolean {
  return role === 'player' || playerView;
}

interface CampaignState {
  campaign: Campaign | null;
  activeSceneId: SceneId | null;
  dirty: boolean;
  assetUrls: Record<string, string>;
  hoveredTokenId: string | null;
  setHoveredTokenId: (id: string | null) => void;
  setCampaign: (c: Campaign | null) => void;
  setActiveScene: (id: SceneId) => void;
  persist: () => Promise<void>;
  updateScene: (sceneId: SceneId, updater: (s: Scene) => Scene) => void;
  addScene: (name: string) => void;
  removeScene: (sceneId: SceneId) => void;
  renameScene: (sceneId: SceneId, name: string) => void;
  setMapAsset: (sceneId: SceneId, assetId: string | undefined) => void;
  addMapLayer: (
    sceneId: SceneId,
    assetId: AssetId,
    size?: { width: number; height: number },
  ) => string;
  removeMapLayer: (sceneId: SceneId, mapLayerId: string) => void;
  updateMapLayerTransform: (
    sceneId: SceneId,
    mapLayerId: string,
    t: Partial<MapTransform>,
    options?: {
      /** Snap grid origin to map centroid in the same update (adjusts viewport). */
      recenter?: boolean;
    },
  ) => void;
  setMapLayerImageSize: (
    sceneId: SceneId,
    mapLayerId: string,
    width: number,
    height: number,
  ) => void;
  bringMapLayerToFront: (sceneId: SceneId, mapLayerId: string) => void;
  recenterGridToMaps: (sceneId: SceneId) => void;
  updateMapTransform: (sceneId: SceneId, t: Partial<MapTransform>) => void;
  addToken: (sceneId: SceneId, token?: Partial<Token>) => void;
  importPastedTokenImage: (sceneId: SceneId, file: Blob, screen: Point) => Promise<void>;
  updateToken: (sceneId: SceneId, tokenId: string, patch: Partial<Token>) => void;
  removeToken: (sceneId: SceneId, tokenId: string) => void;
  toggleStatus: (sceneId: SceneId, tokenId: string, status: StatusEffectId) => void;
  toggleVitalityState: (sceneId: SceneId, tokenId: string, state: TokenVitalityState) => void;
  toggleStatusForTokens: (sceneId: SceneId, tokenIds: string[], status: StatusEffectId) => void;
  toggleVitalityStateForTokens: (
    sceneId: SceneId,
    tokenIds: string[],
    state: TokenVitalityState,
  ) => void;
  toggleVisibleToPlayersForTokens: (sceneId: SceneId, tokenIds: string[]) => void;
  toggleLockedForPlayersForTokens: (sceneId: SceneId, tokenIds: string[]) => void;
  addFogStroke: (sceneId: SceneId, polygon: FogPolygon, target: 'hidden' | 'revealed') => void;
  clearFog: (sceneId: SceneId) => void;
  revealAllFog: (sceneId: SceneId) => void;
  setFogDefaultHidden: (sceneId: SceneId, v: boolean) => void;
  applyFogRect: (sceneId: SceneId, rect: Rect, mode: 'hide' | 'reveal') => void;
  applyFogStroke: (
    sceneId: SceneId,
    points: { x: number; y: number }[],
    radius: number,
    mode: 'hide' | 'reveal',
  ) => void;
  applyFogMulti: (
    sceneId: SceneId,
    mp: unknown,
    mode: 'hide' | 'reveal',
  ) => void;
  addMeasurement: (sceneId: SceneId, m: MeasurementObject) => void;
  removeMeasurement: (sceneId: SceneId, id: string) => void;
  addDrawStroke: (sceneId: SceneId, stroke: DrawStroke) => void;
  removeDrawStroke: (sceneId: SceneId, id: string) => void;
  removeDrawStrokes: (sceneId: SceneId, ids: string[]) => void;
  updateDrawStroke: (sceneId: SceneId, id: string, stroke: DrawStroke) => void;
  updateDrawStrokes: (sceneId: SceneId, strokes: DrawStroke[]) => void;
  bringDrawStrokeToFront: (sceneId: SceneId, strokeId: string) => void;
  bringDrawStrokesToFront: (sceneId: SceneId, strokeIds: string[]) => void;
  registerAssetUrl: (assetId: string, url: string) => void;
  revokeAssetUrl: (assetId: string) => void;
  tokenLibraryDrop: TokenLibraryDropPayload | null;
  tokenLibraryEntryDragId: string | null;
  tokenDragOffMap: boolean;
  tokenLibraryDragOver: boolean;
  tokenLibraryDropTargetGroupId: string | null;
  tokenLibraryDropOverDelete: boolean;
  globalTokenLibraryLayout: TokenLibraryLayout | null;
  beginTokenLibraryDrop: (payload: TokenLibraryDropPayload) => void;
  clearTokenLibraryDrop: () => void;
  setTokenDragOffMap: (v: boolean) => void;
  setTokenLibraryDragOver: (v: boolean) => void;
  setTokenLibraryDropTargetGroupId: (id: string | null) => void;
  setTokenLibraryDropOverDelete: (v: boolean) => void;
  beginLibraryEntryDrag: (entryId: string) => void;
  endLibraryEntryDrag: () => void;
  hydrateCampaignTokenLibrary: () => Promise<void>;
  loadGlobalTokenLibraryLayout: () => Promise<void>;
  updateCampaignTokenLibrary: (updater: (layout: TokenLibraryLayout) => TokenLibraryLayout) => void;
  updateGlobalTokenLibrary: (updater: (layout: TokenLibraryLayout) => TokenLibraryLayout) => void;
  saveTokenToLibraryGroup: (scope: 'campaign' | 'global', groupId: string) => void;
  discardTokenToLibraryTrash: () => void;
  deleteLibraryEntry: (scope: 'campaign' | 'global', entryId: string) => void;
  moveLibraryEntryToGroup: (
    scope: 'campaign' | 'global',
    entryId: string,
    targetGroupId: string,
  ) => void;
  copyTemplatePresetToLibraryGroup: (
    scope: 'campaign' | 'global',
    groupId: string,
    templateColor: string,
    name: string,
  ) => void;
  clearImportGroup: (scope: 'campaign' | 'global') => Promise<void>;
  cancelTokenMove: () => void;
}

interface HistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  historySuppressDepth: number;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;
  runHistorySuppressed: (fn: () => void) => void;
  setCampaignRemote: (c: Campaign) => void;
  commitCampaignUpdate: (updater: (c: Campaign) => Campaign, label?: string) => void;
}

export type AppStore = ViewportState &
  ToolState &
  SelectionState &
  UiState &
  CampaignState &
  SessionState &
  HistoryState;

function historyFromStore(state: {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  historySuppressDepth: number;
}): EditHistoryState {
  return {
    undoStack: state.undoStack,
    redoStack: state.redoStack,
    historySuppressDepth: state.historySuppressDepth,
  };
}

function resolveActiveSceneAfterCampaignChange(
  campaign: Campaign,
  currentActiveId: SceneId | null,
): SceneId | null {
  if (currentActiveId && campaign.scenes[currentActiveId]) return currentActiveId;
  if (campaign.lastActiveSceneId && campaign.scenes[campaign.lastActiveSceneId]) {
    return campaign.lastActiveSceneId;
  }
  const deckScene = campaign.sceneDeck.find((n) => n.type === 'scene');
  return deckScene?.type === 'scene' ? deckScene.sceneId : Object.keys(campaign.scenes)[0] ?? null;
}

function loadUiPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === 'true';
  } catch {
    return fallback;
  }
}

const PLAYER_NAME_KEY = 'battle-map-player-name';
const ACTIVE_TOOL_KEY = 'battle-map-active-tool';

const PERSISTED_TOOLS: ToolMode[] = [
  'pan',
  'select',
  'fog',
  'measure',
  'draw',
  'mapEdit',
  'gridEdit',
  'sceneEdit',
  'transform',
  'players',
];

function loadActiveTool(): ToolMode {
  try {
    const v = localStorage.getItem(ACTIVE_TOOL_KEY);
    if (v && PERSISTED_TOOLS.includes(v as ToolMode)) return v as ToolMode;
  } catch {
    // ignore
  }
  return 'pan';
}

function saveActiveTool(tool: ToolMode): void {
  try {
    localStorage.setItem(ACTIVE_TOOL_KEY, tool);
  } catch {
    // ignore
  }
}

function loadPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function savePlayerName(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(PLAYER_NAME_KEY, trimmed);
    else localStorage.removeItem(PLAYER_NAME_KEY);
  } catch {
    // ignore
  }
}

function applyPlayerDefaultHue(name: string, role: SessionRole): number | undefined {
  if (role !== 'player') return undefined;
  const trimmed = name.trim();
  return trimmed ? hueForPlayerName(trimmed) : undefined;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => AppStore) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void get().persist();
  }, 400);
}

export const useStore = create<AppStore>((set, get) => ({
  scale: 1,
  x: 80,
  y: 80,
  viewportWidth: 800,
  viewportHeight: 600,
  gestureViewport: null,
  setViewport: (v) => set((state) => ({ ...state, ...v })),
  setViewportSize: (width, height) => {
    if (width <= 0 || height <= 0) return;
    set({ viewportWidth: width, viewportHeight: height });
  },
  setGestureViewport: (v) => set({ gestureViewport: v }),
  resetViewport: () => {
    const { campaign, activeSceneId, viewportWidth, viewportHeight } = get();
    const scene =
      activeSceneId && campaign?.scenes[activeSceneId]
        ? migrateSceneMaps(campaign.scenes[activeSceneId])
        : null;
    const mapBounds = scene ? computeMapBounds(scene) : null;
    const centroid = scene ? computeMapsCentroid(scene) : null;
    if (!mapBounds || viewportWidth <= 0 || viewportHeight <= 0) {
      set({ scale: 1, x: 80, y: 80 });
      return;
    }
    const fit = frameMapBoundsInViewport(
      mapBounds,
      viewportWidth,
      viewportHeight,
      centroid ?? undefined,
    );
    set({ scale: fit.scale, x: fit.x, y: fit.y });
  },

  activeTool: loadActiveTool(),
  sceneEditMode: 'map',
  selectedMapLayerId: null,
  measureKind: 'line',
  measurePinMode: false,
  fogBrushCells: 2,
  fogMode: 'hide',
  fogShape: 'stroke',
  alternatingDiagonals: false,
  coneAngleDeg: Math.round((Math.atan(0.5) * 360) / Math.PI * 100) / 100,
  measureDisplayStyle: 'vtt',
  measureDebugDualView: true,
  fogPreview: null,
  fogOpaquePreview: false,
  mapEditDragging: false,
  gridVisible: true,
  selectSnap: 1,
  selectDrawShapes: false,
  drawShape: 'stroke',
  drawHue: 0,
  drawStrokeWidth: DRAW_STROKE_WIDTH_DEFAULT,
  drawPreview: null,
  setTool: (tool) => {
    get().clearSelection();
    saveActiveTool(tool);
    set({
      activeTool: tool,
      fogPreview: null,
      drawPreview: null,
      fogOpaquePreview: false,
      mapEditDragging: false,
    });
  },
  setSceneEditMode: (mode) => set({ sceneEditMode: mode }),
  setSelectedMapLayerId: (id) => set({ selectedMapLayerId: id }),
  setMeasureKind: (k) => set({ measureKind: k }),
  setMeasurePinMode: (v) => set({ measurePinMode: v }),
  setFogBrushCells: (n) => set({ fogBrushCells: n }),
  setFogMode: (mode) => set({ fogMode: mode }),
  setFogShape: (shape) => set({ fogShape: shape }),
  setAlternatingDiagonals: (v) => set({ alternatingDiagonals: v }),
  setConeAngleDeg: (v) => set({ coneAngleDeg: v }),
  setMeasureDisplayStyle: (style) => set({ measureDisplayStyle: style }),
  toggleMeasureDisplayStyle: () =>
    set((s) => ({
      measureDisplayStyle: s.measureDisplayStyle === 'vtt' ? '5e' : 'vtt',
    })),
  setMeasureDebugDualView: (v) => set({ measureDebugDualView: v }),
  setFogPreview: (p) => set({ fogPreview: p }),
  setFogOpaquePreview: (v) => set({ fogOpaquePreview: v }),
  setMapEditDragging: (v) => set({ mapEditDragging: v }),
  setGridVisible: (v) => set({ gridVisible: v }),
  setSelectSnap: (v) => set({ selectSnap: quantizeGridSnapStrength(v) }),
  setSelectDrawShapes: (v) =>
    set((s) => ({
      selectDrawShapes: v,
      selectedDrawStrokeIds: v ? s.selectedDrawStrokeIds : [],
    })),
  setDrawShape: (shape) => set({ drawShape: shape }),
  setDrawHue: (hue) => set({ drawHue: snapHue(hue) }),
  setDrawStrokeWidth: (width) =>
    set((s) => {
      const drawStrokeWidth = clampDrawStrokeWidth(width);
      return {
        drawStrokeWidth,
        drawPreview: s.drawPreview ? { ...s.drawPreview, strokeWidth: drawStrokeWidth } : null,
      };
    }),
  setDrawPreview: (preview) => set({ drawPreview: preview }),

  selectedTokenIds: [],
  selectedMeasurementId: null,
  selectedDrawStrokeIds: [],
  interactionMode: 'idle',
  movePreviewPos: null,
  movePreviewPositions: null,
  scalePreviewById: null,
  drawStrokeDragPreview: null,
  ephemeralMeasure: null,
  fadingMeasurements: {},
  selectToken: (id, opts) => {
    if (opts?.additive) {
      get().toggleTokenInSelection(id);
      return;
    }
    set({
      selectedTokenIds: [id],
      selectedMeasurementId: null,
      selectedDrawStrokeIds: [],
      interactionMode: 'selected',
      movePreviewPos: null,
      movePreviewPositions: null,
      scalePreviewById: null,
    });
  },
  selectTokens: (ids) =>
    set({
      selectedTokenIds: ids,
      selectedMeasurementId: null,
      selectedDrawStrokeIds: [],
      interactionMode: ids.length > 0 ? 'selected' : 'idle',
      movePreviewPos: null,
      movePreviewPositions: null,
      scalePreviewById: null,
    }),
  toggleTokenInSelection: (id) =>
    set((s) => {
      const has = s.selectedTokenIds.includes(id);
      const selectedTokenIds = has
        ? s.selectedTokenIds.filter((x) => x !== id)
        : [...s.selectedTokenIds, id];
      return {
        selectedTokenIds,
        selectedMeasurementId: null,
        selectedDrawStrokeIds: [],
        interactionMode: selectedTokenIds.length > 0 ? 'selected' : 'idle',
        movePreviewPos: null,
        movePreviewPositions: null,
        scalePreviewById: null,
      };
    }),
  selectMeasurement: (id) =>
    set({
      selectedMeasurementId: id,
      selectedTokenIds: [],
      selectedDrawStrokeIds: [],
      interactionMode: 'idle',
      movePreviewPos: null,
      movePreviewPositions: null,
      scalePreviewById: null,
    }),
  selectDrawStroke: (id) =>
    set({
      selectedDrawStrokeIds: id ? [id] : [],
      selectedTokenIds: [],
      selectedMeasurementId: null,
      interactionMode: 'idle',
      movePreviewPos: null,
      movePreviewPositions: null,
      scalePreviewById: null,
    }),
  selectDrawStrokes: (ids) =>
    set({
      selectedDrawStrokeIds: ids,
      selectedTokenIds: [],
      selectedMeasurementId: null,
      interactionMode: 'idle',
      movePreviewPos: null,
      movePreviewPositions: null,
      scalePreviewById: null,
    }),
  toggleDrawStrokeInSelection: (id) =>
    set((s) => {
      const has = s.selectedDrawStrokeIds.includes(id);
      const selectedDrawStrokeIds = has
        ? s.selectedDrawStrokeIds.filter((x) => x !== id)
        : [...s.selectedDrawStrokeIds, id];
      return {
        selectedDrawStrokeIds,
        selectedTokenIds: [],
        selectedMeasurementId: null,
        interactionMode: 'idle',
        movePreviewPos: null,
        movePreviewPositions: null,
        scalePreviewById: null,
      };
    }),
  setInteractionMode: (mode) => set({ interactionMode: mode }),
  setMovePreview: (pos) => set({ movePreviewPos: pos }),
  setMovePreviewPositions: (positions) => {
    const primary = primarySelectedTokenId(get().selectedTokenIds);
    set({
      movePreviewPositions: positions,
      movePreviewPos: positions && primary ? (positions[primary] ?? null) : null,
    });
  },
  setScalePreviewById: (previews) => set({ scalePreviewById: previews }),
  startTokenScale: () =>
    set({
      interactionMode: 'scaling',
      scalePreviewById: null,
      movePreviewPos: null,
      movePreviewPositions: null,
    }),
  cancelTokenScale: () =>
    set({
      interactionMode: 'selected',
      scalePreviewById: null,
    }),
  commitTokenScale: (sceneId) => {
    const preview = get().scalePreviewById;
    if (preview) {
      for (const [tokenId, entry] of Object.entries(preview)) {
        get().updateToken(sceneId, tokenId, {
          footprint: entry.footprint,
          gridPos: entry.placement.gridPos,
          posOffset: entry.placement.posOffset,
        });
      }
    }
    set({
      interactionMode: 'selected',
      scalePreviewById: null,
    });
  },
  setDrawStrokeDragPreview: (strokes) =>
    set((s) => {
      if (strokes === null) {
        return s.drawStrokeDragPreview === null ? s : { drawStrokeDragPreview: null };
      }
      if (s.drawStrokeDragPreview && deepEqual(s.drawStrokeDragPreview, strokes)) {
        return s;
      }
      return { drawStrokeDragPreview: strokes };
    }),
  setEphemeralMeasure: (m) => set({ ephemeralMeasure: m }),
  fadeAndRemoveMeasurement: (sceneId, id) => {
    startMeasurementFade(sceneId, id, {
      onOpacity: (fadeId, opacity) => {
        set((s) => {
          if (opacity === null) {
            if (!(fadeId in s.fadingMeasurements)) return s;
            const next = { ...s.fadingMeasurements };
            delete next[fadeId];
            return { fadingMeasurements: next };
          }
          return { fadingMeasurements: { ...s.fadingMeasurements, [fadeId]: opacity } };
        });
      },
      onRemove: (removeSceneId, removeId) => {
        get().removeMeasurement(removeSceneId, removeId);
      },
    });
  },
  fadeAndRemoveMeasurementsForCurrentUser: (sceneId) => {
    const state = get();
    const scene = state.campaign?.scenes[sceneId];
    if (!scene) return;
    const owned = measurementsOwnedBySessionUser(
      scene.measurements,
      state.role,
      state.playerName,
    );
    for (const m of owned) {
      get().fadeAndRemoveMeasurement(sceneId, m.id);
    }
  },
  clearSelection: () =>
    set({
      selectedTokenIds: [],
      selectedMeasurementId: null,
      selectedDrawStrokeIds: [],
      interactionMode: 'idle',
      movePreviewPos: null,
      movePreviewPositions: null,
      scalePreviewById: null,
      drawStrokeDragPreview: null,
      ephemeralMeasure: null,
    }),
  duplicateSelection: (sceneId) => {
    const state = get();
    const scene = state.campaign?.scenes[sceneId];
    if (!scene) return false;

    if (state.selectDrawShapes && state.selectedDrawStrokeIds.length > 0) {
      const selected = state.selectedDrawStrokeIds
        .map((id) => scene.drawStrokes?.find((stroke) => stroke.id === id))
        .filter((stroke): stroke is NonNullable<typeof stroke> => stroke != null);
      if (selected.length === 0) return false;

      const copies = duplicateDrawStrokes(selected);
      get().updateScene(sceneId, (s) => ({
        ...s,
        drawStrokes: [
          ...(s.drawStrokes ?? []),
          ...copies.map((stroke) => assignDrawStrokeMapLayer(stroke, s)),
        ],
      }));
      get().selectDrawStrokes(copies.map((stroke) => stroke.id));
      return true;
    }

    if (state.selectedTokenIds.length > 0) {
      const selected = state.selectedTokenIds
        .map((id) => scene.tokens.find((token) => token.id === id))
        .filter((token): token is NonNullable<typeof token> => token != null);
      if (selected.length === 0) return false;

      const copies = duplicateTokens(selected);
      get().updateScene(sceneId, (s) => ({
        ...s,
        tokens: [...s.tokens, ...copies.map((token) => assignTokenMapLayer(token, s))],
      }));
      get().selectTokens(copies.map((token) => token.id));
      return true;
    }

    if (state.selectedMeasurementId) {
      const selected = scene.measurements.find((m) => m.id === state.selectedMeasurementId);
      if (!selected) return false;

      const copy = {
        ...duplicateMeasurements([selected])[0]!,
        pinnedBy: currentMeasurementPinnedBy(state.role, state.playerName),
      };
      get().updateScene(sceneId, (s) => ({
        ...s,
        measurements: [...s.measurements, assignMeasurementMapLayer(copy, s)],
      }));
      get().selectMeasurement(copy.id);
      return true;
    }

    return false;
  },

  deleteSelection: (sceneId) => {
    const state = get();
    const scene = state.campaign?.scenes[sceneId];
    if (!scene) return false;

    if (state.selectDrawShapes && state.selectedDrawStrokeIds.length > 0) {
      get().removeDrawStrokes(sceneId, [...state.selectedDrawStrokeIds]);
      return true;
    }

    if (state.selectedTokenIds.length > 0) {
      const idSet = new Set(state.selectedTokenIds);
      get().updateScene(sceneId, (s) => ({
        ...s,
        tokens: s.tokens.filter((token) => !idSet.has(token.id)),
      }));
      get().clearSelection();
      return true;
    }

    if (state.selectedMeasurementId) {
      get().removeMeasurement(sceneId, state.selectedMeasurementId);
      return true;
    }

    return false;
  },

  leftCollapsed: loadUiPref('ui.leftCollapsed', false),
  rightCollapsed: loadUiPref('ui.rightCollapsed', false),
  scenePreviewUrls: {},
  setScenePreviewUrl: (sceneId, dataUrl) =>
    set((s) => ({
      scenePreviewUrls: { ...s.scenePreviewUrls, [sceneId]: dataUrl },
    })),
  setLeftCollapsed: (v) => {
    localStorage.setItem('ui.leftCollapsed', String(v));
    set({ leftCollapsed: v });
  },
  setRightCollapsed: (v) => {
    localStorage.setItem('ui.rightCollapsed', String(v));
    set({ rightCollapsed: v });
  },

  role: 'gm',
  playerView: false,
  roomCode: null,
  playerName: loadPlayerName(),
  syncStatus: 'offline',
  peerCount: 0,
  reconnecting: false,
  setRole: (role) => {
    const drawHue = applyPlayerDefaultHue(get().playerName, role);
    set({
      role,
      playerView: role === 'player' ? false : get().playerView,
      ...(drawHue !== undefined ? { drawHue } : {}),
    });
  },
  setPlayerView: (v) => {
    if (get().role !== 'gm') return;
    set({ playerView: v });
    if (v) {
      const tool = get().activeTool;
      if (tool === 'fog' || tool === 'gridEdit' || tool === 'mapEdit' || tool === 'sceneEdit') {
        set({ activeTool: 'pan' });
      }
    }
  },
  setRoomCode: (code) => set({ roomCode: code }),
  setPlayerName: (name) => {
    const drawHue = applyPlayerDefaultHue(name, get().role);
    set({
      playerName: name,
      ...(drawHue !== undefined ? { drawHue } : {}),
    });
    savePlayerName(name);
  },
  setSyncStatus: (status) => set({ syncStatus: status }),
  setPeerCount: (n) => set({ peerCount: n }),
  setReconnecting: (v) => set({ reconnecting: v }),

  campaign: null,
  activeSceneId: null,
  dirty: false,
  assetUrls: {},
  hoveredTokenId: null,
  setHoveredTokenId: (id) => set({ hoveredTokenId: id }),

  undoStack: [],
  redoStack: [],
  historySuppressDepth: 0,
  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
  runHistorySuppressed: (fn) => {
    set((s) => ({ historySuppressDepth: s.historySuppressDepth + 1 }));
    try {
      fn();
    } finally {
      set((s) => ({
        historySuppressDepth: Math.max(0, s.historySuppressDepth - 1),
      }));
    }
  },
  commitCampaignUpdate: (updater, label) => {
    const { campaign } = get();
    if (!campaign) return;
    const before = cloneSnapshot(campaign);
    const after = updater(before);
    if (deepEqual(before, after)) return;

    let nextHistory = historyFromStore(get());
    if (!isHistorySuppressed(nextHistory)) {
      const patches = diffCampaign(before, after);
      if (patches.length > 0) {
        nextHistory = pushHistoryEntry(nextHistory, patches, label);
      }
    }

    const activeSceneId = resolveActiveSceneAfterCampaignChange(after, get().activeSceneId);
    if (activeSceneId && after.scenes[activeSceneId]) {
      setGridOffset(after.scenes[activeSceneId].gridOffset ?? DEFAULT_GRID_OFFSET);
    }

    set({
      campaign: after,
      dirty: true,
      activeSceneId,
      undoStack: nextHistory.undoStack,
      redoStack: nextHistory.redoStack,
    });
    schedulePersist(get);
  },
  undo: () => {
    const { campaign } = get();
    if (!campaign) return;
    const result = performUndo(campaign, historyFromStore(get()));
    if (!result) return;

    get().runHistorySuppressed(() => {
      const activeSceneId = resolveActiveSceneAfterCampaignChange(
        result.campaign,
        get().activeSceneId,
      );
      if (activeSceneId && result.campaign.scenes[activeSceneId]) {
        setGridOffset(result.campaign.scenes[activeSceneId].gridOffset ?? DEFAULT_GRID_OFFSET);
      }
      set({
        campaign: result.campaign,
        dirty: true,
        activeSceneId,
        undoStack: result.state.undoStack,
        redoStack: result.state.redoStack,
      });
      schedulePersist(get);
    });
  },
  redo: () => {
    const { campaign } = get();
    if (!campaign) return;
    const result = performRedo(campaign, historyFromStore(get()));
    if (!result) return;

    get().runHistorySuppressed(() => {
      const activeSceneId = resolveActiveSceneAfterCampaignChange(
        result.campaign,
        get().activeSceneId,
      );
      if (activeSceneId && result.campaign.scenes[activeSceneId]) {
        setGridOffset(result.campaign.scenes[activeSceneId].gridOffset ?? DEFAULT_GRID_OFFSET);
      }
      set({
        campaign: result.campaign,
        dirty: true,
        activeSceneId,
        undoStack: result.state.undoStack,
        redoStack: result.state.redoStack,
      });
      schedulePersist(get);
    });
  },
  setCampaignRemote: (c) => {
    get().runHistorySuppressed(() => {
      const scenes: Record<string, Scene> = {};
      for (const [id, scene] of Object.entries(c.scenes)) {
        scenes[id] = migrateSceneMaps(scene);
      }
      const activeSceneId =
        (c.lastActiveSceneId && scenes[c.lastActiveSceneId]
          ? c.lastActiveSceneId
          : Object.keys(scenes)[0]) ?? null;
      set({
        campaign: { ...c, scenes },
        activeSceneId,
        dirty: false,
        selectedMapLayerId: null,
      });
      if (activeSceneId && scenes[activeSceneId]) {
        setGridOffset(scenes[activeSceneId].gridOffset ?? DEFAULT_GRID_OFFSET);
      } else {
        setGridOffset(DEFAULT_GRID_OFFSET);
      }
      void get().hydrateCampaignTokenLibrary();
    });
  },

  setCampaign: (c) => {
    if (!c) {
      setGridOffset(DEFAULT_GRID_OFFSET);
      set({
        campaign: null,
        activeSceneId: null,
        dirty: false,
        selectedMapLayerId: null,
        ...createInitialHistoryState(),
      });
      return;
    }
    const scenes: Record<string, Scene> = {};
    for (const [id, scene] of Object.entries(c.scenes)) {
      scenes[id] = migrateSceneMaps(scene);
    }
    const activeSceneId = c.lastActiveSceneId ?? Object.keys(scenes)[0] ?? null;
    set({
      campaign: { ...c, scenes },
      activeSceneId,
      dirty: false,
      selectedMapLayerId: null,
      ...createInitialHistoryState(),
    });
    if (activeSceneId && scenes[activeSceneId]) {
      setGridOffset(scenes[activeSceneId].gridOffset ?? DEFAULT_GRID_OFFSET);
    } else {
      setGridOffset(DEFAULT_GRID_OFFSET);
    }
    void get().hydrateCampaignTokenLibrary();
  },
  setActiveScene: (id) => {
    const { campaign } = get();
    if (!campaign) return;
    const scene = migrateSceneMaps(campaign.scenes[id]);
    setGridOffset(scene.gridOffset ?? DEFAULT_GRID_OFFSET);
    const updated = { ...campaign, lastActiveSceneId: id, updatedAt: Date.now() };
    set({ campaign: updated, activeSceneId: id, dirty: true });
    schedulePersist(get);
  },
  persist: async () => {
    const { campaign } = get();
    if (!campaign) return;
    await saveCampaign(campaign);
    set({ dirty: false });
  },
  updateScene: (sceneId, updater) => {
    const { campaign } = get();
    if (!campaign) return;
    const scene = campaign.scenes[sceneId];
    if (!scene) return;

    const beforeScene = cloneSnapshot(scene);
    const afterScene = updater(beforeScene);
    if (deepEqual(beforeScene, afterScene)) return;

    const updatedCampaign: Campaign = {
      ...campaign,
      scenes: { ...campaign.scenes, [sceneId]: afterScene },
      updatedAt: Date.now(),
    };

    let nextHistory = historyFromStore(get());
    if (!isHistorySuppressed(nextHistory)) {
      const patches = diffScene(sceneId, beforeScene, afterScene);
      if (patches.length > 0) {
        nextHistory = pushHistoryEntry(nextHistory, patches);
      }
    }

    set({
      campaign: updatedCampaign,
      dirty: true,
      undoStack: nextHistory.undoStack,
      redoStack: nextHistory.redoStack,
    });
    schedulePersist(get);
  },
  addScene: (name) => {
    const { campaign } = get();
    if (!campaign) return;
    const scene = createScene(name);
    get().commitCampaignUpdate(
      (c) => ({
        ...c,
        scenes: { ...c.scenes, [scene.id]: scene },
        sceneDeck: [...c.sceneDeck, { type: 'scene', sceneId: scene.id }],
        updatedAt: Date.now(),
      }),
      'Add scene',
    );
    set({ activeSceneId: scene.id });
  },
  removeScene: (sceneId) => {
    const { campaign, activeSceneId } = get();
    if (!campaign) return;
    get().commitCampaignUpdate((c) => {
      const { [sceneId]: _, ...scenes } = c.scenes;
      const sceneDeck = c.sceneDeck.filter(
        (n) => n.type !== 'scene' || n.sceneId !== sceneId,
      );
      return { ...c, scenes, sceneDeck, updatedAt: Date.now() };
    }, 'Remove scene');
    if (activeSceneId === sceneId) {
      const next = get().campaign;
      const nextId = next ? resolveActiveSceneAfterCampaignChange(next, null) : null;
      if (nextId) set({ activeSceneId: nextId });
    }
  },
  renameScene: (sceneId, name) => {
    get().updateScene(sceneId, (s) => ({ ...s, name }));
  },
  setMapAsset: (sceneId, assetId) => {
    if (!assetId) {
      get().updateScene(sceneId, (s) => ({ ...s, maps: [] }));
      set({ selectedMapLayerId: null });
      return;
    }
    const url = get().assetUrls[assetId];
    if (url) {
      loadImageDimensions(url)
        .then(({ width, height }) => get().addMapLayer(sceneId, assetId, { width, height }))
        .catch(() => get().addMapLayer(sceneId, assetId));
    } else {
      get().addMapLayer(sceneId, assetId);
    }
  },
  addMapLayer: (sceneId, assetId, size) => {
    const layerId = newId();
    get().updateScene(sceneId, (s) => {
      const maps = sceneMaps(s);
      return {
        ...s,
        maps: [
          ...maps,
          {
            id: layerId,
            assetId,
            transform: offsetMapTransform(maps.length),
            imageWidth: size?.width,
            imageHeight: size?.height,
          },
        ],
      };
    });
    set({ selectedMapLayerId: layerId });
    get().recenterGridToMaps(sceneId);
    return layerId;
  },
  removeMapLayer: (sceneId, mapLayerId) => {
    get().updateScene(sceneId, (s) =>
      reassignChildrenAfterMapRemoved(
        {
          ...s,
          maps: sceneMaps(s).filter((m) => m.id !== mapLayerId),
        },
        mapLayerId,
      ),
    );
    if (get().selectedMapLayerId === mapLayerId) {
      const scene = get().campaign?.scenes[sceneId];
      const remaining = scene ? sceneMaps(scene) : [];
      set({ selectedMapLayerId: remaining[remaining.length - 1]?.id ?? null });
    }
    get().recenterGridToMaps(sceneId);
  },
  setMapLayerImageSize: (sceneId, mapLayerId, width, height) => {
    if (width <= 0 || height <= 0) return;
    get().updateScene(sceneId, (s) => {
      const maps = sceneMaps(s);
      const layer = maps.find((m) => m.id === mapLayerId);
      if (!layer || (layer.imageWidth === width && layer.imageHeight === height)) return s;
      return {
        ...s,
        maps: maps.map((m) =>
          m.id === mapLayerId ? { ...m, imageWidth: width, imageHeight: height } : m,
        ),
      };
    });
  },
  bringMapLayerToFront: (sceneId, mapLayerId) => {
    get().updateScene(sceneId, (s) => {
      const maps = sceneMaps(s);
      const reordered = reorderMapLayerToFront(maps, mapLayerId);
      if (reordered === maps) return s;
      return reassignAllObjectMapParents({ ...s, maps: reordered });
    });
  },
  updateMapLayerTransform: (sceneId, mapLayerId, t, options) => {
    const state = get();
    let recenterMeta: { delta: Point; newOffset: Point } | undefined;

    get().updateScene(sceneId, (s) => {
      const maps = sceneMaps(s);
      const layer = maps.find((m) => m.id === mapLayerId);
      if (!layer) return s;
      const oldTransform = { ...layer.transform };
      const newTransform = mergeMapTransform(oldTransform, t);
      const withMap = {
        ...s,
        maps: maps.map((m) =>
          m.id === mapLayerId ? { ...m, transform: newTransform } : m,
        ),
      };
      let result = applyMapTransformToSceneChildren(
        withMap,
        mapLayerId,
        oldTransform,
        newTransform,
      );
      if (options?.recenter) {
        const recentered = recenterSceneGrid(result);
        if (recentered) {
          result = recentered.scene;
          recenterMeta = { delta: recentered.delta, newOffset: recentered.newOffset };
        }
      }
      return result;
    });

    if (recenterMeta) {
      setGridOffset(recenterMeta.newOffset);
      set({
        x: state.x - recenterMeta.delta.x * state.scale,
        y: state.y - recenterMeta.delta.y * state.scale,
      });
    }
  },
  recenterGridToMaps: (sceneId) => {
    const state = get();
    const scene = state.campaign?.scenes[sceneId];
    if (!scene || !state.campaign) return;

    const recentered = recenterSceneGrid(migrateSceneMaps(scene));
    if (!recentered) return;

    get().commitCampaignUpdate(
      (c) => ({
        ...c,
        scenes: { ...c.scenes, [sceneId]: recentered.scene },
        updatedAt: Date.now(),
      }),
      'Recenter grid',
    );
    setGridOffset(recentered.newOffset);
    set({
      x: state.x - recentered.delta.x * state.scale,
      y: state.y - recentered.delta.y * state.scale,
    });
  },
  updateMapTransform: (sceneId, t) => {
    const layerId = get().selectedMapLayerId;
    const scene = get().campaign?.scenes[sceneId];
    const maps = scene ? sceneMaps(scene) : [];
    const targetId = layerId ?? maps[maps.length - 1]?.id;
    if (!targetId) return;
    get().updateMapLayerTransform(sceneId, targetId, t);
  },
  addToken: (sceneId, partial) => {
    if (partial?.imageAssetId && isMapAssetId(partial.imageAssetId, get().campaign)) {
      return;
    }
    const scene = get().campaign?.scenes[sceneId];
    const state = get();
    const color =
      partial?.color ??
      (state.role === 'player' && state.playerName.trim()
        ? colorForPlayerName(state.playerName)
        : TOKEN_COLORS[(scene?.tokens.length ?? 0) % TOKEN_COLORS.length] ?? '#3b82f6');
    const token: Token = {
      id: newId(),
      name: partial?.name ?? `Token ${(scene?.tokens.length ?? 0) + 1}`,
      gridPos: partial?.gridPos ?? { col: 0, row: 0 },
      footprint: partial?.footprint ?? { w: 1, h: 1 },
      rotation: 0,
      statusEffects: [],
      owner: get().role === 'player' ? 'player' : 'gm',
      color,
      ...partial,
    };
    get().updateScene(sceneId, (s) => ({
      ...s,
      tokens: [...s.tokens, assignTokenMapLayer(token, s)],
    }));
    get().selectToken(token.id);
    get().setTool('select');
  },
  importPastedTokenImage: async (sceneId, file, screen) => {
    const campaign = get().campaign;
    if (!campaign) return;
    const { x: stageX, y: stageY, scale } = get();
    try {
      const size = await loadBlobImageSize(file);
      const footprint = footprintForImagePixels(size.width, size.height);
      const assetId = newId();
      const baseName = file instanceof File && file.name
        ? file.name.replace(/\.[^.]+$/, '')
        : 'Pasted token';
      const mimeType = file.type || 'image/png';
      await saveAsset({
        id: assetId,
        campaignId: campaign.id,
        blob: file,
        mimeType,
        name: file instanceof File && file.name ? file.name : `${baseName}.png`,
        createdAt: Date.now(),
        kind: 'token',
      });
      get().registerAssetUrl(assetId, URL.createObjectURL(file));
      const gridPos = gridPosForTokenCenteredAtScreen(
        screen,
        { x: stageX, y: stageY },
        scale,
        footprint,
      );
      get().addToken(sceneId, {
        name: baseName,
        imageAssetId: assetId,
        gridPos,
        footprint,
      });
    } catch (err) {
      console.error('Failed to paste token image', err);
    }
  },
  updateToken: (sceneId, tokenId, patch) => {
    get().updateScene(sceneId, (s) => {
      const gridOffset = s.gridOffset ?? DEFAULT_GRID_OFFSET;
      return {
        ...s,
        tokens: s.tokens.map((t) => {
          if (t.id !== tokenId) return t;
          const next = { ...t, ...patch };
          if (patch.gridPos != null || patch.footprint != null) {
            next.mapLayerId = resolveMapLayerForWorldPoint(
              tokenAnchorWorld(next, gridOffset),
              s,
            );
          }
          return next;
        }),
      };
    });
  },
  removeToken: (sceneId, tokenId) => {
    get().updateScene(sceneId, (s) => ({
      ...s,
      tokens: s.tokens.filter((t) => t.id !== tokenId),
    }));
    if (get().selectedTokenIds.includes(tokenId)) {
      const next = get().selectedTokenIds.filter((id) => id !== tokenId);
      if (next.length === 0) get().clearSelection();
      else get().selectTokens(next);
    }
  },
  toggleStatus: (sceneId, tokenId, status) => {
    get().updateScene(sceneId, (s) => ({
      ...s,
      tokens: s.tokens.map((t) => {
        if (t.id !== tokenId) return t;
        const has = t.statusEffects.includes(status);
        return {
          ...t,
          statusEffects: has
            ? t.statusEffects.filter((x) => x !== status)
            : [...t.statusEffects, status],
        };
      }),
    }));
  },
  toggleVitalityState: (sceneId, tokenId, state) => {
    get().updateScene(sceneId, (s) => ({
      ...s,
      tokens: s.tokens.map((t) => {
        if (t.id !== tokenId) return t;
        return {
          ...t,
          vitalityState: t.vitalityState === state ? undefined : state,
        };
      }),
    }));
  },
  toggleStatusForTokens: (sceneId, tokenIds, status) => {
    const idSet = new Set(tokenIds);
    get().updateScene(sceneId, (s) => {
      const selected = s.tokens.filter((t) => idSet.has(t.id));
      const allHave =
        selected.length > 0 && selected.every((t) => t.statusEffects.includes(status));
      return {
        ...s,
        tokens: s.tokens.map((t) => {
          if (!idSet.has(t.id)) return t;
          const has = t.statusEffects.includes(status);
          if (allHave) {
            return has
              ? { ...t, statusEffects: t.statusEffects.filter((x) => x !== status) }
              : t;
          }
          return has ? t : { ...t, statusEffects: [...t.statusEffects, status] };
        }),
      };
    });
  },
  toggleVitalityStateForTokens: (sceneId, tokenIds, state) => {
    const idSet = new Set(tokenIds);
    get().updateScene(sceneId, (s) => {
      const selected = s.tokens.filter((t) => idSet.has(t.id));
      const allHave = selected.length > 0 && selected.every((t) => t.vitalityState === state);
      return {
        ...s,
        tokens: s.tokens.map((t) => {
          if (!idSet.has(t.id)) return t;
          return {
            ...t,
            vitalityState: allHave ? undefined : state,
          };
        }),
      };
    });
  },
  toggleVisibleToPlayersForTokens: (sceneId, tokenIds) => {
    const idSet = new Set(tokenIds);
    get().updateScene(sceneId, (s) => {
      const selected = s.tokens.filter((t) => idSet.has(t.id));
      const allVisible =
        selected.length > 0 && selected.every((t) => t.visibleToPlayers !== false);
      return {
        ...s,
        tokens: s.tokens.map((t) => {
          if (!idSet.has(t.id)) return t;
          return { ...t, visibleToPlayers: allVisible ? false : true };
        }),
      };
    });
  },
  toggleLockedForPlayersForTokens: (sceneId, tokenIds) => {
    const idSet = new Set(tokenIds);
    get().updateScene(sceneId, (s) => {
      const selected = s.tokens.filter((t) => idSet.has(t.id));
      const allLocked =
        selected.length > 0 && selected.every((t) => t.lockedForPlayers === true);
      return {
        ...s,
        tokens: s.tokens.map((t) => {
          if (!idSet.has(t.id)) return t;
          return { ...t, lockedForPlayers: allLocked ? false : true };
        }),
      };
    });
  },
  addFogStroke: (sceneId, polygon, target) => {
    get().updateScene(sceneId, (s) => {
      const key = target === 'hidden' ? 'unexploredMask' : 'revealedMask';
      const assigned = assignFogPolygonMapLayer(polygon, s);
      return {
        ...s,
        fog: normalizeFogState({
          ...s.fog,
          [key]: [...s.fog[key], assigned],
        }),
      };
    });
  },
  applyFogRect: (sceneId, rect, mode) => {
    get().updateScene(sceneId, (s) => {
      type Pair = [number, number];
      type Ring = Pair[];
      type Polygon = Ring[];
      type MultiPolygon = Polygon[];

      const rectToPoly = (r: Rect): Polygon => [
        [
          [r.x, r.y],
          [r.x + r.w, r.y],
          [r.x + r.w, r.y + r.h],
          [r.x, r.y + r.h],
          [r.x, r.y],
        ],
      ];

      const fogToMulti = (polys: FogPolygon[]): MultiPolygon => {
        const out: MultiPolygon = [];
        for (const p of polys) {
          const anyP = p as any;
          const ringsSrc: { x: number; y: number }[][] =
            Array.isArray(anyP.rings) ? anyP.rings : Array.isArray(anyP.points) ? [anyP.points] : [];
          if (ringsSrc.length === 0) continue;
          const poly: Polygon = [];
          for (const r of ringsSrc) {
            if (r.length < 3) continue;
            const ring: Ring = r.map((pt) => [pt.x, pt.y]);
            const first = ring[0]!;
            const last = ring[ring.length - 1]!;
            if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
            poly.push(ring);
          }
          if (poly.length) out.push(poly);
        }
        return out;
      };

      const multiToFog = (mp: MultiPolygon): FogPolygon[] => {
        const polys: FogPolygon[] = [];
        for (const poly of mp) {
          if (!poly || poly.length === 0) continue;
          const rings: { x: number; y: number }[][] = [];
          for (const ring of poly) {
            if (!ring || ring.length < 4) continue;
            rings.push(ring.slice(0, -1).map(([x, y]) => ({ x, y })));
          }
          if (rings.length === 0) continue;
          polys.push({ id: newId(), rings } as FogPolygon);
        }
        return polys.map((p) => assignFogPolygonMapLayer(p, s));
      };

      const rectPoly = rectToPoly(rect);
      const hiddenMp = fogToMulti(s.fog.unexploredMask);
      const revealedMp = fogToMulti(s.fog.revealedMask);

      if (mode === 'hide') {
        const nextHidden = polygonClipping.union(hiddenMp, rectPoly) as MultiPolygon;
        const nextRevealed = polygonClipping.difference(revealedMp, rectPoly) as MultiPolygon;
        return {
          ...s,
          fog: normalizeFogState({
            ...s.fog,
            unexploredMask: multiToFog(nextHidden),
            revealedMask: multiToFog(nextRevealed),
          }),
        };
      }

      const nextRevealed = polygonClipping.union(revealedMp, rectPoly) as MultiPolygon;
      const nextHidden = polygonClipping.difference(hiddenMp, rectPoly) as MultiPolygon;

      return {
        ...s,
        fog: normalizeFogState({
          ...s.fog,
          revealedMask: multiToFog(nextRevealed),
          unexploredMask: multiToFog(nextHidden),
        }),
      };
    });
  },
  applyFogStroke: (sceneId, points, radius, mode) => {
    get().updateScene(sceneId, (s) => {
      type Pair = [number, number];
      type Ring = Pair[];
      type Polygon = Ring[];
      type MultiPolygon = Polygon[];

      const fogToMulti = (polys: FogPolygon[]): MultiPolygon => {
        const out: MultiPolygon = [];
        for (const p of polys) {
          const anyP = p as any;
          const ringsSrc: { x: number; y: number }[][] =
            Array.isArray(anyP.rings) ? anyP.rings : Array.isArray(anyP.points) ? [anyP.points] : [];
          if (ringsSrc.length === 0) continue;
          const poly: Polygon = [];
          for (const r of ringsSrc) {
            if (r.length < 3) continue;
            const ring: Ring = r.map((pt) => [pt.x, pt.y]);
            const first = ring[0]!;
            const last = ring[ring.length - 1]!;
            if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
            poly.push(ring);
          }
          if (poly.length) out.push(poly);
        }
        return out;
      };

      const multiToFog = (mp: MultiPolygon): FogPolygon[] => {
        const polys: FogPolygon[] = [];
        for (const poly of mp) {
          if (!poly || poly.length === 0) continue;
          const rings: { x: number; y: number }[][] = [];
          for (const ring of poly) {
            if (!ring || ring.length < 4) continue;
            rings.push(ring.slice(0, -1).map(([x, y]) => ({ x, y })));
          }
          if (rings.length === 0) continue;
          polys.push({ id: newId(), rings } as FogPolygon);
        }
        return polys.map((p) => assignFogPolygonMapLayer(p, s));
      };

      const strokeToPoly = (pts: { x: number; y: number }[]): MultiPolygon => {
        if (pts.length === 0 || radius <= 0) return [];
        const steps = 16;
        const circle = (cx: number, cy: number): Polygon => {
          const ring: Ring = [];
          for (let i = 0; i < steps; i++) {
            const a = (2 * Math.PI * i) / steps;
            ring.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
          }
          ring.push(ring[0]!);
          return [ring];
        };

        const capsule = (a: { x: number; y: number }, b: { x: number; y: number }): MultiPolygon => {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy);
          if (len < 1e-6) return [circle(a.x, a.y)];
          const ux = dx / len;
          const uy = dy / len;
          const px = -uy;
          const py = ux;
          const ring: Ring = [
            [a.x + px * radius, a.y + py * radius],
            [b.x + px * radius, b.y + py * radius],
            [b.x - px * radius, b.y - py * radius],
            [a.x - px * radius, a.y - py * radius],
            [a.x + px * radius, a.y + py * radius],
          ];
          return polygonClipping.union([circle(a.x, a.y)], [circle(b.x, b.y)], [ring]) as MultiPolygon;
        };

        let mp: MultiPolygon = [];
        mp = polygonClipping.union(mp, circle(pts[0]!.x, pts[0]!.y)) as MultiPolygon;
        for (let i = 1; i < pts.length; i++) {
          const seg = capsule(pts[i - 1]!, pts[i]!);
          mp = polygonClipping.union(mp, seg) as MultiPolygon;
        }
        return mp;
      };

      const strokeMp = strokeToPoly(points);
      const hiddenMp = fogToMulti(s.fog.unexploredMask);
      const revealedMp = fogToMulti(s.fog.revealedMask);

      if (mode === 'hide') {
        const nextHidden = polygonClipping.union(hiddenMp, strokeMp) as MultiPolygon;
        const nextRevealed = polygonClipping.difference(revealedMp, strokeMp) as MultiPolygon;
        return {
          ...s,
          fog: normalizeFogState({
            ...s.fog,
            unexploredMask: multiToFog(nextHidden),
            revealedMask: multiToFog(nextRevealed),
          }),
        };
      }

      const nextRevealed = polygonClipping.union(revealedMp, strokeMp) as MultiPolygon;
      const nextHidden = polygonClipping.difference(hiddenMp, strokeMp) as MultiPolygon;
      return {
        ...s,
        fog: normalizeFogState({
          ...s.fog,
          revealedMask: multiToFog(nextRevealed),
          unexploredMask: multiToFog(nextHidden),
        }),
      };
    });
  },
  applyFogMulti: (sceneId, mp, mode) => {
    get().updateScene(sceneId, (s) => {
      type Pair = [number, number];
      type Ring = Pair[];
      type Polygon = Ring[];
      type MultiPolygon = Polygon[];

      const fogToMulti = (polys: FogPolygon[]): MultiPolygon => {
        const out: MultiPolygon = [];
        for (const p of polys) {
          const anyP = p as any;
          const ringsSrc: { x: number; y: number }[][] =
            Array.isArray(anyP.rings) ? anyP.rings : Array.isArray(anyP.points) ? [anyP.points] : [];
          if (ringsSrc.length === 0) continue;
          const poly: Polygon = [];
          for (const r of ringsSrc) {
            if (r.length < 3) continue;
            const ring: Ring = r.map((pt) => [pt.x, pt.y]);
            const first = ring[0]!;
            const last = ring[ring.length - 1]!;
            if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
            poly.push(ring);
          }
          if (poly.length) out.push(poly);
        }
        return out;
      };

      const multiToFog = (mp: MultiPolygon): FogPolygon[] => {
        const polys: FogPolygon[] = [];
        for (const poly of mp) {
          if (!poly || poly.length === 0) continue;
          const rings: { x: number; y: number }[][] = [];
          for (const ring of poly) {
            if (!ring || ring.length < 4) continue;
            rings.push(ring.slice(0, -1).map(([x, y]) => ({ x, y })));
          }
          if (rings.length === 0) continue;
          polys.push({ id: newId(), rings } as FogPolygon);
        }
        return polys.map((p) => assignFogPolygonMapLayer(p, s));
      };

      const hiddenMp = fogToMulti(s.fog.unexploredMask);
      const revealedMp = fogToMulti(s.fog.revealedMask);
      const shapeMp = mp as MultiPolygon;

      if (mode === 'hide') {
        const nextHidden = polygonClipping.union(hiddenMp, shapeMp) as MultiPolygon;
        const nextRevealed = polygonClipping.difference(revealedMp, shapeMp) as MultiPolygon;
        return {
          ...s,
          fog: normalizeFogState({
            ...s.fog,
            unexploredMask: multiToFog(nextHidden),
            revealedMask: multiToFog(nextRevealed),
          }),
        };
      }

      const nextRevealed = polygonClipping.union(revealedMp, shapeMp) as MultiPolygon;
      const nextHidden = polygonClipping.difference(hiddenMp, shapeMp) as MultiPolygon;
      return {
        ...s,
        fog: normalizeFogState({
          ...s.fog,
          revealedMask: multiToFog(nextRevealed),
          unexploredMask: multiToFog(nextHidden),
        }),
      };
    });
  },
  clearFog: (sceneId) => {
    get().updateScene(sceneId, (s) => ({
      ...s,
      fog: { ...DEFAULT_FOG },
    }));
  },
  revealAllFog: (sceneId) => {
    get().updateScene(sceneId, (s) => ({
      ...s,
      fog: { unexploredMask: [], revealedMask: [], defaultHidden: false },
    }));
  },
  setFogDefaultHidden: (sceneId, v) => {
    get().updateScene(sceneId, (s) => {
      const next = v ? applyFullMapFog(s) : removeFullMapFog(s);
      return { ...next, fog: normalizeFogState(next.fog) };
    });
  },
  addMeasurement: (sceneId, m) => {
    get().updateScene(sceneId, (s) => ({
      ...s,
      measurements: [...s.measurements, assignMeasurementMapLayer(m, s)],
    }));
  },
  removeMeasurement: (sceneId, id) => {
    get().updateScene(sceneId, (s) => ({
      ...s,
      measurements: s.measurements.filter((m) => m.id !== id),
    }));
    if (get().selectedMeasurementId === id) get().clearSelection();
  },
  addDrawStroke: (sceneId, stroke) => {
    get().updateScene(sceneId, (s) => ({
      ...s,
      drawStrokes: [...(s.drawStrokes ?? []), assignDrawStrokeMapLayer(stroke, s)],
    }));
  },
  removeDrawStroke: (sceneId, id) => {
    get().updateScene(sceneId, (s) => ({
      ...s,
      drawStrokes: (s.drawStrokes ?? []).filter((stroke) => stroke.id !== id),
    }));
    set((s) => ({
      selectedDrawStrokeIds: s.selectedDrawStrokeIds.filter((sid) => sid !== id),
    }));
  },
  removeDrawStrokes: (sceneId, ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    get().updateScene(sceneId, (s) => ({
      ...s,
      drawStrokes: (s.drawStrokes ?? []).filter((stroke) => !idSet.has(stroke.id)),
    }));
    set((s) => ({
      selectedDrawStrokeIds: s.selectedDrawStrokeIds.filter((sid) => !idSet.has(sid)),
    }));
  },
  updateDrawStroke: (sceneId, id, stroke) => {
    get().updateScene(sceneId, (s) => ({
      ...s,
      drawStrokes: (s.drawStrokes ?? []).map((s0) => (s0.id === id ? stroke : s0)),
    }));
  },
  updateDrawStrokes: (sceneId, strokes) => {
    if (strokes.length === 0) return;
    const byId = new Map(strokes.map((stroke) => [stroke.id, stroke]));
    get().updateScene(sceneId, (s) => ({
      ...s,
      drawStrokes: (s.drawStrokes ?? []).map((st) => byId.get(st.id) ?? st),
    }));
  },
  bringDrawStrokeToFront: (sceneId, strokeId) => {
    get().bringDrawStrokesToFront(sceneId, [strokeId]);
  },
  bringDrawStrokesToFront: (sceneId, strokeIds) => {
    if (strokeIds.length === 0) return;
    const idSet = new Set(strokeIds);
    get().updateScene(sceneId, (s) => {
      const strokes = s.drawStrokes ?? [];
      const rest = strokes.filter((st) => !idSet.has(st.id));
      const front = strokes.filter((st) => idSet.has(st.id));
      return { ...s, drawStrokes: [...rest, ...front] };
    });
  },
  registerAssetUrl: (assetId, url) =>
    set((s) => ({ assetUrls: { ...s.assetUrls, [assetId]: url } })),
  revokeAssetUrl: (assetId) => {
    const url = get().assetUrls[assetId];
    if (url) URL.revokeObjectURL(url);
    set((s) => {
      const { [assetId]: _, ...rest } = s.assetUrls;
      return { assetUrls: rest };
    });
  },

  tokenLibraryDrop: null,
  tokenLibraryEntryDragId: null,
  tokenDragOffMap: false,
  tokenLibraryDragOver: false,
  tokenLibraryDropTargetGroupId: null,
  tokenLibraryDropOverDelete: false,
  globalTokenLibraryLayout: null,
  beginTokenLibraryDrop: (payload) => set({ tokenLibraryDrop: payload }),
  clearTokenLibraryDrop: () => set({ tokenLibraryDrop: null }),
  setTokenDragOffMap: (v) =>
    set((s) => (s.tokenDragOffMap === v ? s : { tokenDragOffMap: v })),
  setTokenLibraryDragOver: (v) =>
    set((s) => {
      if (s.tokenLibraryDragOver === v) return s;
      return {
        tokenLibraryDragOver: v,
        ...(v ? {} : { tokenLibraryDropTargetGroupId: null, tokenLibraryDropOverDelete: false }),
      };
    }),
  setTokenLibraryDropTargetGroupId: (id) =>
    set({ tokenLibraryDropTargetGroupId: id, tokenLibraryDropOverDelete: false }),
  setTokenLibraryDropOverDelete: (v) =>
    set({
      tokenLibraryDropOverDelete: v,
      ...(v ? { tokenLibraryDropTargetGroupId: null } : {}),
    }),
  beginLibraryEntryDrag: (entryId) => set({ tokenLibraryEntryDragId: entryId }),
  endLibraryEntryDrag: () => set({ tokenLibraryEntryDragId: null, tokenLibraryDropTargetGroupId: null }),
  cancelTokenMove: () =>
    set({
      movePreviewPositions: null,
      interactionMode: 'selected',
      tokenLibraryDrop: null,
      tokenDragOffMap: false,
      tokenLibraryDragOver: false,
      tokenLibraryDropTargetGroupId: null,
      tokenLibraryDropOverDelete: false,
    }),
  hydrateCampaignTokenLibrary: async () => {
    const { campaign } = get();
    if (!campaign) return;
    const assets = await loadCampaignAssets(campaign.id);
    const mapIds = mapAssetIdsInCampaign(campaign);
    const assetIds = assets
      .filter((a) => isTokenLibraryAsset(a, mapIds))
      .map((a) => a.id);
    const layout = migrateTokenLibraryLayout(campaign.tokenLibrary, assetIds);
    if (!campaign.tokenLibrary) {
      get().runHistorySuppressed(() => {
        set({
          campaign: { ...campaign, tokenLibrary: layout, updatedAt: Date.now() },
          dirty: true,
        });
        schedulePersist(get);
      });
    }
  },
  loadGlobalTokenLibraryLayout: async () => {
    const { campaign } = get();
    const stored = await loadTokenLibraryLayout(GLOBAL_CAMPAIGN_ID);
    const assets = await loadCampaignAssets(GLOBAL_CAMPAIGN_ID);
    const mapIds = campaign ? mapAssetIdsInCampaign(campaign) : new Set<string>();
    const assetIds = assets
      .filter((a) => isTokenLibraryAsset(a, mapIds))
      .map((a) => a.id);
    const layout = migrateTokenLibraryLayout(stored, assetIds);
    if (!stored) {
      await saveTokenLibraryLayout(GLOBAL_CAMPAIGN_ID, layout);
    }
    set({ globalTokenLibraryLayout: layout });
  },
  updateCampaignTokenLibrary: (updater) => {
    get().commitCampaignUpdate((c) => {
      const base = c.tokenLibrary ?? defaultTokenLibraryLayout([]);
      const layout = updater(base);
      return { ...c, tokenLibrary: layout, updatedAt: Date.now() };
    });
  },
  updateGlobalTokenLibrary: (updater) => {
    const base = get().globalTokenLibraryLayout ?? defaultTokenLibraryLayout([]);
    const layout = updater(base);
    set({ globalTokenLibraryLayout: layout });
    void saveTokenLibraryLayout(GLOBAL_CAMPAIGN_ID, layout);
  },
  saveTokenToLibraryGroup: (scope, groupId) => {
    const state = get();
    let payloads: TokenLibraryDropPayload[] = [];
    if (state.interactionMode === 'moving') {
      payloads = getMovingTokenDropPayloads(
        state.campaign,
        state.activeSceneId,
        state.movePreviewPositions,
        state.selectedTokenIds,
      );
    } else if (state.tokenLibraryDrop) {
      payloads = [state.tokenLibraryDrop];
    }
    if (payloads.length === 0) return;

    const updater = (layout: TokenLibraryLayout) =>
      payloads.reduce((l, p) => addTokenDropToGroup(l, groupId, p), layout);
    if (scope === 'campaign') {
      get().updateCampaignTokenLibrary(updater);
    } else {
      get().updateGlobalTokenLibrary(updater);
    }

    const removedIds = new Set(payloads.map((p) => p.tokenId));
    const { activeSceneId, selectedTokenIds } = get();
    if (activeSceneId) {
      for (const p of payloads) {
        get().removeToken(activeSceneId, p.tokenId);
      }
    }
    set({
      tokenLibraryDrop: null,
      tokenLibraryDragOver: false,
      tokenLibraryDropTargetGroupId: null,
      tokenLibraryDropOverDelete: false,
      tokenDragOffMap: false,
      movePreviewPositions: null,
      interactionMode: 'selected',
      selectedTokenIds: selectedTokenIds.filter((id) => !removedIds.has(id)),
    });
  },
  discardTokenToLibraryTrash: () => {
    const { tokenLibraryDrop, interactionMode, campaign, activeSceneId, selectedTokenIds, movePreviewPositions } =
      get();
    const payloads =
      interactionMode === 'moving'
        ? getMovingTokenDropPayloads(campaign, activeSceneId, movePreviewPositions, selectedTokenIds)
        : tokenLibraryDrop
          ? [tokenLibraryDrop]
          : [];
    const removedIds = new Set<string>();
    if (activeSceneId && campaign) {
      for (const p of payloads) {
        const token = campaign.scenes[activeSceneId]?.tokens.find((t) => t.id === p.tokenId);
        if (token && canEditToken(token)) {
          get().removeToken(activeSceneId, p.tokenId);
          removedIds.add(p.tokenId);
        }
      }
    }
    set({
      tokenLibraryDrop: null,
      tokenLibraryDragOver: false,
      tokenLibraryDropTargetGroupId: null,
      tokenLibraryDropOverDelete: false,
      tokenDragOffMap: false,
      movePreviewPositions: null,
      interactionMode: 'selected',
      selectedTokenIds: selectedTokenIds.filter((id) => !removedIds.has(id)),
    });
  },
  deleteLibraryEntry: (scope, entryId) => {
    const updater = (layout: TokenLibraryLayout) => removeEntry(layout, entryId).layout;
    if (scope === 'campaign') {
      get().updateCampaignTokenLibrary(updater);
    } else {
      get().updateGlobalTokenLibrary(updater);
    }
    set({ tokenLibraryEntryDragId: null });
  },
  moveLibraryEntryToGroup: (scope, entryId, targetGroupId) => {
    const updater = (layout: TokenLibraryLayout) =>
      moveLibraryEntryToGroup(layout, entryId, targetGroupId);
    if (scope === 'campaign') {
      get().updateCampaignTokenLibrary(updater);
    } else {
      get().updateGlobalTokenLibrary(updater);
    }
    set({ tokenLibraryEntryDragId: null });
  },
  copyTemplatePresetToLibraryGroup: (scope, groupId, templateColor, name) => {
    const updater = (layout: TokenLibraryLayout) =>
      copyTemplatePresetToGroup(layout, groupId, templateColor, name);
    if (scope === 'campaign') {
      get().updateCampaignTokenLibrary(updater);
    } else {
      get().updateGlobalTokenLibrary(updater);
    }
  },
  clearImportGroup: async (scope) => {
    if (scope === 'campaign') {
      const { campaign } = get();
      if (!campaign?.tokenLibrary) return;
      const { layout, deletedAssetIds } = removeImportGroupEntries(campaign.tokenLibrary);
      get().updateCampaignTokenLibrary(() => layout);
      for (const id of deletedAssetIds) {
        get().revokeAssetUrl(id);
        await deleteAsset(id);
      }
    } else {
      const global = get().globalTokenLibraryLayout;
      if (!global) return;
      const { layout, deletedAssetIds } = removeImportGroupEntries(global);
      get().updateGlobalTokenLibrary(() => layout);
      for (const id of deletedAssetIds) {
        get().revokeAssetUrl(id);
        await deleteAsset(id);
      }
    }
  },
}));

export function useActiveScene(): Scene | null {
  const campaign = useStore((s) => s.campaign);
  const activeSceneId = useStore((s) => s.activeSceneId);
  if (!campaign || !activeSceneId) return null;
  return campaign.scenes[activeSceneId] ?? null;
}

/** Committed viewport, or in-progress pan/zoom while the map is being dragged. */
export function useLiveViewport(): { x: number; y: number; scale: number } {
  const gesture = useStore((s) => s.gestureViewport);
  const x = useStore((s) => s.x);
  const y = useStore((s) => s.y);
  const scale = useStore((s) => s.scale);
  return gesture ?? { x, y, scale };
}

export function createAndSetCampaign(name: string) {
  const campaign = createCampaign(name);
  useStore.getState().setCampaign(campaign);
  void useStore.getState().persist();
  return campaign;
}

export function pinEphemeralMeasurement(
  sceneId: SceneId,
  kind: MeasureKind,
  params: MeasurementParams,
  displayStyle?: MeasureDisplayStyle,
) {
  const state = useStore.getState();
  const m: MeasurementObject = {
    id: newId(),
    kind,
    params,
    color: defaultPlayerColor(state.playerName, state.drawHue ?? 0),
    displayStyle,
    pinnedBy: currentMeasurementPinnedBy(state.role, state.playerName),
  };
  useStore.getState().addMeasurement(sceneId, m);
}
