export type SceneId = string;
export type TokenId = string;
export type AssetId = string;
export type CampaignId = string;

export type ToolMode =
  | 'pan'
  | 'select'
  | 'fog'
  | 'measure'
  | 'draw'
  | 'mapEdit'
  | 'gridEdit'
  | 'sceneEdit'
  | 'transform'
  | 'players';

/** Sub-mode when the combined scene edit tool is active. */
export type SceneEditMode = 'grid' | 'map';

export type MeasureKind = 'line' | 'cone' | 'cube' | 'sphere';

/** VTT = smooth shapes; 5e = highlight affected grid cells. */
export type MeasureDisplayStyle = 'vtt' | '5e';
/** @deprecated use MeasureDisplayStyle */
export type ConeStyle = MeasureDisplayStyle;
export type DrawShapeKind = 'stroke' | 'rect' | MeasureKind;
/** Draw tool mode — includes erase, which is not persisted on the scene. */
export type DrawToolShape = 'stroke' | 'rect' | Exclude<MeasureKind, 'cube'> | 'erase';
export type InteractionMode = 'idle' | 'selected' | 'moving' | 'scaling';
export type SessionRole = 'gm' | 'player';
export type SyncStatus = 'offline' | 'connecting' | 'connected' | 'error';

export const GLOBAL_CAMPAIGN_ID = '__global__';

export type StatusEffectId =
  | 'blinded'
  | 'charmed'
  | 'deafened'
  | 'frightened'
  | 'grappled'
  | 'incapacitated'
  | 'invisible'
  | 'paralyzed'
  | 'petrified'
  | 'poisoned'
  | 'prone'
  | 'restrained'
  | 'stunned'
  | 'unconscious';

export type TokenVitalityState = 'bloodied' | 'dead';

export interface Point {
  x: number;
  y: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GridCell {
  col: number;
  row: number;
}

/** Token position on the grid (cell + optional sub-cell offset). */
export interface TokenGridPlacement {
  gridPos: GridCell;
  posOffset?: Point;
}

export interface MapTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface Token {
  id: TokenId;
  name: string;
  imageAssetId?: AssetId;
  gridPos: GridCell;
  footprint: { w: number; h: number };
  rotation: number;
  statusEffects: StatusEffectId[];
  /** Mutually exclusive with dead — at most one vitality state at a time. */
  vitalityState?: TokenVitalityState;
  owner: 'gm' | 'player';
  color: string;
  /** Map layer this token is placed on (moves with the map). */
  mapLayerId?: string;
  /** Sub-grid offset from gridPos cell top-left (world px). Set when map transform displaces off-grid. */
  posOffset?: Point;
  /** When false, players cannot see this token; GM sees it at reduced opacity. */
  visibleToPlayers?: boolean;
  /** When true, players can select but not move this token. */
  lockedForPlayers?: boolean;
}

export interface FogPolygon {
  id: string;
  /** rings[0] = outer ring, rings[1..] = holes */
  rings: Point[][];
  /** Map layer this fog shape is placed on (moves with the map). */
  mapLayerId?: string;
}

export interface FogState {
  unexploredMask: FogPolygon[];
  revealedMask: FogPolygon[];
  defaultHidden: boolean;
}

export interface LineMeasureParams {
  from: Point;
  to: Point;
}

export interface RectMeasureParams {
  from: Point;
  to: Point;
  /** Degrees clockwise around the rect center (draw tool). */
  rotationDeg?: number;
}

export interface ConeMeasureParams {
  origin: Point;
  direction: number;
  lengthCells: number;
  angleDeg: number;
  style?: MeasureDisplayStyle;
  /** VTT: exact arc radius in world px (drag distance). */
  lengthWorld?: number;
}

export interface CubeMeasureParams {
  center: GridCell;
  radiusCells: number;
  /** Precise world center (avoids grid snap when transforming with the map). */
  origin?: Point;
}

export interface SphereMeasureParams {
  center: GridCell;
  radiusCells: number;
  /** Precise world center for draw circles (avoids grid snap when transforming). */
  origin?: Point;
  /** Precise world radius for draw circles. */
  radiusWorld?: number;
}

export type MeasurementParams =
  | LineMeasureParams
  | RectMeasureParams
  | ConeMeasureParams
  | CubeMeasureParams
  | SphereMeasureParams;

export interface MeasurementObject {
  id: string;
  kind: MeasureKind;
  params: MeasurementParams;
  color: string;
  /** VTT smooth vs 5e grid-cell highlight. */
  displayStyle?: MeasureDisplayStyle;
  /** Map layer this measurement is placed on (moves with the map). */
  mapLayerId?: string;
  /** Who pinned this measurement (used for per-user dismiss). */
  pinnedBy?: { role: 'gm' | 'player'; name: string };
}

export interface DrawStroke {
  id: string;
  kind: DrawShapeKind;
  color: string;
  strokeWidth: number;
  /** Map layer this stroke is placed on (moves with the map). */
  mapLayerId?: string;
  points?: Point[];
  params?: MeasurementParams;
  /** Who created this stroke (used for multiplayer sync). */
  createdBy?: { role: 'gm' | 'player'; name: string };
}

export interface DrawPreview {
  kind: DrawShapeKind;
  color: string;
  strokeWidth: number;
  points?: Point[];
  params?: MeasurementParams;
}

export interface SceneMapLayer {
  id: string;
  assetId: AssetId;
  transform: MapTransform;
  imageWidth?: number;
  imageHeight?: number;
}

export interface Scene {
  id: SceneId;
  name: string;
  maps: SceneMapLayer[];
  /** @deprecated Migrated into `maps`. */
  mapAssetId?: AssetId;
  /** @deprecated Migrated into `maps`. */
  mapTransform?: MapTransform;
  tokens: Token[];
  fog: FogState;
  measurements: MeasurementObject[];
  drawStrokes: DrawStroke[];
  /** World position of grid cell (0,0) top-left corner. */
  gridOffset?: Point;
}

export type SceneDeckNode =
  | { type: 'scene'; sceneId: SceneId }
  | { type: 'folder'; id: string; name: string; children: SceneDeckNode[] };

export type TokenLibraryGroupKind = 'import' | 'templates' | 'user';

export interface TokenLibraryGroup {
  id: string;
  name: string;
  kind: TokenLibraryGroupKind;
  collapsed: boolean;
  order: number;
}

export type TokenLibraryEntry =
  | {
      id: string;
      groupId: string;
      kind: 'asset';
      assetId: string;
      name: string;
      order: number;
    }
  | {
      id: string;
      groupId: string;
      kind: 'color';
      color: string;
      name: string;
      footprint: { w: number; h: number };
      order: number;
    }
  | {
      id: string;
      groupId: string;
      kind: 'template';
      templateColor: string;
      name: string;
      order: number;
    };

export interface TokenLibraryLayout {
  groups: TokenLibraryGroup[];
  entries: TokenLibraryEntry[];
}

export interface TokenLibraryDropPayload {
  tokenId: string;
  name: string;
  color: string;
  imageAssetId?: string;
  footprint: { w: number; h: number };
}

export interface Campaign {
  id: CampaignId;
  name: string;
  sceneDeck: SceneDeckNode[];
  scenes: Record<SceneId, Scene>;
  lastActiveSceneId?: SceneId;
  tokenLibrary?: TokenLibraryLayout;
  createdAt: number;
  updatedAt: number;
  version?: number;
}

export interface EphemeralMeasurement {
  kind: MeasureKind;
  params: MeasurementParams;
  opacity: number;
  displayStyle?: MeasureDisplayStyle;
}

export interface FogPreview {
  kind: 'stroke' | 'rect' | 'cone' | 'sphere';
  // stroke
  points?: Point[];
  radius?: number;
  // rect
  from?: Point;
  to?: Point;
  // cone
  origin?: Point;
  direction?: number;
  lengthCells?: number;
  lengthWorld?: number;
  angleDeg?: number;
  style?: MeasureDisplayStyle;
  // sphere
  center?: GridCell;
  radiusCells?: number;
}

export const DEFAULT_MAP_TRANSFORM: MapTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
};

export const DEFAULT_FOG: FogState = {
  unexploredMask: [],
  revealedMask: [],
  defaultHidden: false,
};
