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
export type DrawShapeKind = 'stroke' | 'rect' | 'text' | MeasureKind;
/** Draw tool mode — includes erase, which is not persisted on the scene. */
export type DrawToolShape = 'stroke' | 'rect' | 'text' | Exclude<MeasureKind, 'cube'> | 'erase';
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

/** 5e movement modes for token speed entries. */
export type TokenSpeedType = 'walk' | 'fly' | 'swim' | 'climb' | 'burrow';

export interface TokenSpeed {
  type: TokenSpeedType;
  /** Feet as a digit string; empty = unset. */
  value: string;
}

/** 5e skill names for token sheet skill slots. */
export type TokenSkillType =
  | 'acrobatics'
  | 'animalHandling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleightOfHand'
  | 'stealth'
  | 'survival';

export interface TokenSkill {
  type: TokenSkillType;
  /** Bonus expression (e.g. +5, +1d4); empty = unset. */
  value: string;
}

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

/** Image placement inside footprint, in cell units relative to footprint top-left. */
export interface TokenImageTransform {
  /** Offset of image top-left within the footprint (cells). */
  offset: Point;
  /** Display size of the image in cells. */
  size: { w: number; h: number };
}

/** Explicit selection outline in cell units within the footprint. */
export interface TokenOutlineStyle {
  shape: 'circle' | 'rect';
  /** Outline AABB top-left within the footprint (cells). */
  offset: Point;
  /** Outline AABB size in cells (circle is inscribed). */
  size: { w: number; h: number };
}

/** Unsaved draft in the Imports appearance inspector (session UI state). */
export interface ImportsInspectTarget {
  assetId: AssetId;
  name: string;
  scope: 'campaign' | 'global' | 'map';
  entryId?: string;
  footprint: { w: number; h: number };
  imageTransform: TokenImageTransform;
  outline: TokenOutlineStyle;
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
  /**
   * Image placement inside the footprint (cell units from footprint top-left).
   * When absent, the image stretches to fill the footprint.
   */
  imageTransform?: TokenImageTransform;
  /**
   * Explicit selection outline. When absent, outline is derived from opaque pixels.
   */
  outline?: TokenOutlineStyle;
  rotation: number;
  statusEffects: StatusEffectId[];
  /** Mutually exclusive with dead — at most one vitality state at a time. */
  vitalityState?: TokenVitalityState;
  /** Combat / character stats (empty/undefined = unset). */
  /** Initiative bonus expression (e.g. +2, +1d4). */
  initiative?: string;
  ac?: string;
  hp?: string;
  speeds?: TokenSpeed[];
  str?: string;
  dex?: string;
  con?: string;
  int?: string;
  wis?: string;
  cha?: string;
  /** Ability mod/save expressions (e.g. +1, +1d10-1). */
  strMod?: string;
  dexMod?: string;
  conMod?: string;
  intMod?: string;
  wisMod?: string;
  chaMod?: string;
  strSave?: string;
  dexSave?: string;
  conSave?: string;
  intSave?: string;
  wisSave?: string;
  chaSave?: string;
  skills?: TokenSkill[];
  /** Which skill types occupy the three sheet skill slots (`null` = None). */
  skillSlots?: Array<TokenSkillType | null>;
  alignment?: string;
  passivePerception?: string;
  senses?: string;
  languages?: string;
  xp?: string;
  /** Free-text traits, actions, reactions, effects, and similar descriptions. */
  actions?: string;
  /** Which collapsible sheet section is expanded (Attributes vs Actions). */
  sheetSection?: 'attributes' | 'actions';
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

export type FogPaintMode = 'hide' | 'reveal';

export type FogOp =
  | { id: string; kind: 'stroke'; mode: FogPaintMode; points: Point[]; radius: number }
  | { id: string; kind: 'rect'; mode: FogPaintMode; x: number; y: number; w: number; h: number }
  | { id: string; kind: 'polygon'; mode: FogPaintMode; rings: Point[][] };

export interface FogState {
  defaultHidden: boolean;
  ops: FogOp[];
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
  /** When false, other players cannot see this measurement; owner and GM still see it. */
  visibleToPlayers?: boolean;
}

/** MS Paint–style draw text: origin is the bottom-left of the text box. */
export interface DrawTextParams {
  origin: Point;
  text: string;
  fontFamily: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export type DrawStrokeParams = MeasurementParams | DrawTextParams;

export interface DrawStroke {
  id: string;
  kind: DrawShapeKind;
  color: string;
  /** For text strokes, this is the font size in world pixels. */
  strokeWidth: number;
  /** Map layer this stroke is placed on (moves with the map). */
  mapLayerId?: string;
  points?: Point[];
  params?: DrawStrokeParams;
  /** Who created this stroke (used for multiplayer sync). */
  createdBy?: { role: 'gm' | 'player'; name: string };
}

export interface DrawPreview {
  kind: DrawShapeKind;
  color: string;
  strokeWidth: number;
  points?: Point[];
  params?: DrawStrokeParams;
}

/** In-progress text while typing (live-synced without the local marquee). */
export interface EphemeralDrawText {
  color: string;
  strokeWidth: number;
  params: DrawTextParams;
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

/** Sheet/stats copied when a map token is saved into a library group. */
export interface TokenSheetSnapshot {
  initiative?: string;
  ac?: string;
  hp?: string;
  speeds?: TokenSpeed[];
  str?: string;
  dex?: string;
  con?: string;
  int?: string;
  wis?: string;
  cha?: string;
  strMod?: string;
  dexMod?: string;
  conMod?: string;
  intMod?: string;
  wisMod?: string;
  chaMod?: string;
  strSave?: string;
  dexSave?: string;
  conSave?: string;
  intSave?: string;
  wisSave?: string;
  chaSave?: string;
  skills?: TokenSkill[];
  /** Which skill types occupy the three sheet skill slots (`null` = None). */
  skillSlots?: Array<TokenSkillType | null>;
  alignment?: string;
  passivePerception?: string;
  senses?: string;
  languages?: string;
  xp?: string;
  actions?: string;
  sheetSection?: 'attributes' | 'actions';
}

export type TokenLibraryEntry =
  | {
      id: string;
      groupId: string;
      kind: 'asset';
      assetId: string;
      name: string;
      order: number;
      /** Footprint when placed on the map (defaults to 1×1). */
      footprint?: { w: number; h: number };
      imageTransform?: TokenImageTransform;
      outline?: TokenOutlineStyle;
      /** Character sheet fields; *-expressions resolve when placed. */
      sheet?: TokenSheetSnapshot;
    }
  | {
      id: string;
      groupId: string;
      kind: 'color';
      color: string;
      name: string;
      footprint: { w: number; h: number };
      order: number;
      sheet?: TokenSheetSnapshot;
    }
  | {
      id: string;
      groupId: string;
      kind: 'template';
      templateColor: string;
      name: string;
      order: number;
      sheet?: TokenSheetSnapshot;
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
  imageTransform?: TokenImageTransform;
  outline?: TokenOutlineStyle;
  sheet?: TokenSheetSnapshot;
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
  defaultHidden: false,
  ops: [],
};
