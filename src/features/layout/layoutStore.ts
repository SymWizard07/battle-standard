import { create } from 'zustand';
import {
  applyLegacyCollapse,
  createDefaultLayoutProfiles,
  defaultLayoutForDevice,
} from './layoutDefaults';
import { setPanelCollapseAtPath } from './layoutPanelChrome';
import {
  updateSplitSizes as applySplitSizes,
  setTabsActive as applyTabsActive,
  addModuleAsTab,
  moveTabBetweenGroups,
} from './layoutTreeUtils';
import type { CollapseDirection } from './schema/layoutSchema';
import type { DeviceClass, LayoutNode, LayoutProfiles, ModuleId } from './schema/layoutSchema';
import { cloneLayout, repairLayoutTree, validateLayout } from './schema/layoutSchema';

const STORAGE_KEY = 'ui.layout.v1';

function loadLayoutProfiles(): LayoutProfiles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateFromLegacy();
    const parsed = JSON.parse(raw) as LayoutProfiles;
    if (parsed.desktop && parsed.tablet && parsed.mobile) {
      const profiles: LayoutProfiles = {
        desktop: repairLayoutTree(cloneLayout(parsed.desktop)),
        tablet: repairLayoutTree(cloneLayout(parsed.tablet)),
        mobile: repairLayoutTree(cloneLayout(parsed.mobile)),
      };
      persistLayoutProfiles(profiles);
      return profiles;
    }
  } catch {
    /* use defaults */
  }
  return migrateFromLegacy();
}

function migrateFromLegacy(): LayoutProfiles {
  const defaults = createDefaultLayoutProfiles();
  let leftCollapsed = false;
  let rightCollapsed = false;
  try {
    leftCollapsed = localStorage.getItem('ui.leftCollapsed') === 'true';
    rightCollapsed = localStorage.getItem('ui.rightCollapsed') === 'true';
  } catch {
    /* ignore */
  }
  defaults.desktop = applyLegacyCollapse(defaults.desktop, leftCollapsed, rightCollapsed);
  persistLayoutProfiles(defaults);
  return defaults;
}

function persistLayoutProfiles(profiles: LayoutProfiles): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    /* ignore quota */
  }
}

function clearLegacyCollapseFlags(): void {
  try {
    localStorage.removeItem('ui.leftCollapsed');
    localStorage.removeItem('ui.rightCollapsed');
  } catch {
    /* ignore */
  }
}

function sanitizeProfile(node: LayoutNode, device: DeviceClass): LayoutNode {
  const repaired = repairLayoutTree(cloneLayout(node));
  const err = validateLayout(repaired);
  if (err) {
    console.warn(`Layout validation failed for ${device}: ${err}`);
    return defaultLayoutForDevice(device);
  }
  return repaired;
}

interface LayoutState {
  layoutProfiles: LayoutProfiles;
  editorDraft: LayoutProfiles | null;
  /** Bumped when applied profiles change so the live shell remounts panel groups. */
  layoutMountKey: number;
  editorDevice: DeviceClass;
  setLayoutProfile: (device: DeviceClass, tree: LayoutNode) => void;
  updateSplitSizes: (device: DeviceClass, path: number[], sizes: number[]) => void;
  setTabsActive: (device: DeviceClass, path: number[], activeTabId: string) => void;
  addModuleToLayout: (device: DeviceClass, path: number[], moduleId: ModuleId) => void;
  moveTab: (
    device: DeviceClass,
    fromPath: number[],
    tabId: string,
    toPath: number[],
  ) => void;
  resetLayoutProfile: (device: DeviceClass) => void;
  copyLayoutFromDevice: (from: DeviceClass, to: DeviceClass) => void;
  beginLayoutEdit: (device: DeviceClass) => void;
  updateEditorDraft: (device: DeviceClass, tree: LayoutNode) => void;
  setPanelCollapse: (device: DeviceClass, path: number[], collapse: CollapseDirection | undefined) => void;
  applyEditorDraft: () => void;
  cancelEditorDraft: () => void;
  setEditorDevice: (device: DeviceClass) => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layoutProfiles: loadLayoutProfiles(),
  editorDraft: null,
  layoutMountKey: 0,
  editorDevice: 'desktop',

  setLayoutProfile: (device, tree) => {
    const sanitized = sanitizeProfile(cloneLayout(tree), device);
    const layoutProfiles = { ...get().layoutProfiles, [device]: sanitized };
    persistLayoutProfiles(layoutProfiles);
    set({ layoutProfiles, layoutMountKey: get().layoutMountKey + 1 });
  },

  updateSplitSizes: (device, path, sizes) => {
    const apply = (tree: LayoutNode) =>
      repairLayoutTree(applySplitSizes(tree, path, sizes));
    const draft = get().editorDraft;
    if (draft) {
      set({ editorDraft: { ...draft, [device]: apply(draft[device]) } });
      return;
    }
    const profiles = get().layoutProfiles;
    const nextProfile = apply(profiles[device]);
    const layoutProfiles = { ...profiles, [device]: nextProfile };
    persistLayoutProfiles(layoutProfiles);
    set({ layoutProfiles });
  },

  setTabsActive: (device, path, activeTabId) => {
    const draft = get().editorDraft;
    if (draft) {
      set({
        editorDraft: {
          ...draft,
          [device]: applyTabsActive(draft[device], path, activeTabId),
        },
      });
      return;
    }

    const profiles = get().layoutProfiles;
    const nextProfile = applyTabsActive(profiles[device], path, activeTabId);
    const layoutProfiles = { ...profiles, [device]: nextProfile };
    persistLayoutProfiles(layoutProfiles);
    set({ layoutProfiles });
  },

  addModuleToLayout: (device, path, moduleId) => {
    const draft = get().editorDraft;
    if (draft) {
      const next = addModuleAsTab(draft[device], path, moduleId);
      set({ editorDraft: { ...draft, [device]: next } });
      return;
    }
    const current = get().layoutProfiles[device];
    const next = addModuleAsTab(current, path, moduleId);
    get().setLayoutProfile(device, next);
  },

  moveTab: (device, fromPath, tabId, toPath) => {
    const draft = get().editorDraft;
    if (draft) {
      const next = moveTabBetweenGroups(draft[device], fromPath, tabId, toPath);
      set({
        editorDraft: { ...draft, [device]: next },
      });
      return;
    }
    const current = get().layoutProfiles[device];
    const next = moveTabBetweenGroups(current, fromPath, tabId, toPath);
    get().setLayoutProfile(device, next);
  },

  resetLayoutProfile: (device) => {
    clearLegacyCollapseFlags();
    const next = sanitizeProfile(defaultLayoutForDevice(device), device);
    const layoutProfiles = { ...get().layoutProfiles, [device]: next };
    persistLayoutProfiles(layoutProfiles);
    const draft = get().editorDraft;
    set({
      layoutProfiles,
      layoutMountKey: get().layoutMountKey + 1,
      ...(draft ? { editorDraft: { ...draft, [device]: cloneLayout(next) } } : {}),
    });
  },

  copyLayoutFromDevice: (from, to) => {
    const source = cloneLayout(get().editorDraft?.[from] ?? get().layoutProfiles[from]);
    const draft = get().editorDraft;
    if (draft) {
      set({ editorDraft: { ...draft, [to]: source } });
      return;
    }
    get().setLayoutProfile(to, source);
  },

  beginLayoutEdit: (device) => {
    const { layoutProfiles } = get();
    set({
      editorDevice: device,
      editorDraft: {
        desktop: cloneLayout(layoutProfiles.desktop),
        tablet: cloneLayout(layoutProfiles.tablet),
        mobile: cloneLayout(layoutProfiles.mobile),
      },
    });
  },

  updateEditorDraft: (device, tree) => {
    const draft = get().editorDraft;
    if (!draft) return;
    set({
      editorDraft: {
        ...draft,
        [device]: cloneLayout(tree),
      },
    });
  },

  setPanelCollapse: (device, path, collapse) => {
    const draft = get().editorDraft;
    if (draft) {
      const next = setPanelCollapseAtPath(draft[device], path, collapse);
      set({ editorDraft: { ...draft, [device]: next } });
      return;
    }
    const current = get().layoutProfiles[device];
    const next = setPanelCollapseAtPath(current, path, collapse);
    get().setLayoutProfile(device, next);
  },

  applyEditorDraft: () => {
    const draft = get().editorDraft;
    if (!draft) return;
    const layoutProfiles: LayoutProfiles = {
      desktop: sanitizeProfile(draft.desktop, 'desktop'),
      tablet: sanitizeProfile(draft.tablet, 'tablet'),
      mobile: sanitizeProfile(draft.mobile, 'mobile'),
    };
    persistLayoutProfiles(layoutProfiles);
    set({
      layoutProfiles,
      layoutMountKey: get().layoutMountKey + 1,
      editorDraft: {
        desktop: cloneLayout(layoutProfiles.desktop),
        tablet: cloneLayout(layoutProfiles.tablet),
        mobile: cloneLayout(layoutProfiles.mobile),
      },
    });
  },

  cancelEditorDraft: () => set({ editorDraft: null }),

  setEditorDevice: (device) => set({ editorDevice: device }),
}));

export function getActiveLayout(device: DeviceClass): LayoutNode {
  const { layoutProfiles, editorDraft } = useLayoutStore.getState();
  if (editorDraft) return editorDraft[device];
  return layoutProfiles[device];
}
