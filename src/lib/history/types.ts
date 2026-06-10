import type {
  Campaign,
  DrawStroke,
  FogState,
  MeasurementObject,
  Scene,
  SceneDeckNode,
  SceneMapLayer,
  Token,
  TokenLibraryLayout,
} from '../types';
import type { Point } from '../types';

export type HistoryObjectKind =
  | 'token'
  | 'measurement'
  | 'drawStroke'
  | 'mapLayer'
  | 'fog'
  | 'sceneMeta'
  | 'scene'
  | 'sceneDeck'
  | 'tokenLibrary';

export type ObjectRef = {
  kind: HistoryObjectKind;
  sceneId?: string;
  id: string;
};

export type SceneMetaSnapshot = {
  gridOffset: Point;
  name: string;
};

export type ObjectSnapshot =
  | Token
  | MeasurementObject
  | DrawStroke
  | SceneMapLayer
  | FogState
  | SceneMetaSnapshot
  | Scene
  | SceneDeckNode[]
  | TokenLibraryLayout;

export type ObjectPatch = {
  ref: ObjectRef;
  before: ObjectSnapshot | null;
  after: ObjectSnapshot | null;
};

export type HistoryEntry = {
  id: string;
  label?: string;
  /** Start time of this coalesced burst (unchanged while merging). */
  timestamp: number;
  patches: ObjectPatch[];
  /** Operation group for debounced coalescing. */
  coalesceKey?: string;
};

export type EditHistoryState = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  historySuppressDepth: number;
};

export const MAX_HISTORY_ENTRIES = 100;

export type CampaignGetter = () => Campaign | null;
export type CampaignSetter = (campaign: Campaign) => void;
