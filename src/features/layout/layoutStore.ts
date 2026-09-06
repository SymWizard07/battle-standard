import { create } from 'zustand';
import {
  createDefaultLayoutProfiles,
  defaultLayoutForDevice,
} from './layoutDefaults';
import { setPanelCollapseAtPath } from './layoutPanelChrome';
import {
  updateSplitSizes as applySplitSizes,
  setTabsActive as applyTabsActive,
  addModuleAsTab,
  moveTabBetweenGroups,
  findModuleInLayout,
} from './layoutTreeUtils';
import type { CollapseDirection } from './schema/layoutSchema';
import type { DeviceClass, LayoutNode, LayoutProfiles, ModuleId } from './schema/layoutSchema';
import {
  cloneLayout,
  sanitizeLayoutProfile,
  repairLayoutTree,
  validateLayoutProfiles,
} from './schema/layoutSchema';

const STORAGE_KEY = 'ui.layout.v1';

/** Same builder path as Reset desktop / new-user defaults. */
function freshDefaultProfile(device: DeviceClass): LayoutNode {
  return sanitizeLayoutProfile(
    defaultLayoutForDevice(device),
    defaultLayoutForDevice(device),
  );
}

function loadLayoutProfiles(): LayoutProfiles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultLayoutProfiles();
    const parsed = JSON.parse(raw) as LayoutProfiles;
    if (parsed.desktop && parsed.tablet && parsed.mobile) {
      const profiles: LayoutProfiles = {
        desktop: sanitizeLayoutProfile(parsed.desktop, defaultLayoutForDevice('desktop')),
        tablet: sanitizeLayoutProfile(parsed.tablet, defaultLayoutForDevice('tablet')),
        mobile: sanitizeLayoutProfile(parsed.mobile, defaultLayoutForDevice('mobile')),
      };
      persistLayoutProfiles(profiles);
      return profiles;
    }
  } catch {
    /* use defaults */
  }
  return createDefaultLayoutProfiles();
}

function persistLayoutProfiles(profiles: LayoutProfiles): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    /* ignore quota */
  }
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
  /** Activate a module wherever it lives (switches its tab group if needed). */
  activateModule: (device: DeviceClass, moduleId: ModuleId) => boolean;
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
  applyEditorDraft: () => boolean;
  cancelEditorDraft: () => void;
  setEditorDevice: (device: DeviceClass) => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layoutProfiles: loadLayoutProfiles(),
  editorDraft: null,
  layoutMountKey: 0,
  editorDevice: 'desktop',

  setLayoutProfile: (device, tree) => {
    const sanitized = sanitizeLayoutProfile(
      cloneLayout(tree),
      defaultLayoutForDevice(device),
    );
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

  activateModule: (device, moduleId) => {
    const draft = get().editorDraft;
    const tree = draft?.[device] ?? get().layoutProfiles[device];
    const loc = findModuleInLayout(tree, moduleId);
    if (!loc) return false;
    if (loc.kind === 'tabs') {
      get().setTabsActive(device, loc.path, loc.tabId);
    }
    return true;
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
    const next = freshDefaultProfile(device);
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
    if (!draft) return false;
    const err = validateLayoutProfiles(draft);
    if (err) return false;
    const layoutProfiles: LayoutProfiles = {
      desktop: sanitizeLayoutProfile(draft.desktop, defaultLayoutForDevice('desktop')),
      tablet: sanitizeLayoutProfile(draft.tablet, defaultLayoutForDevice('tablet')),
      mobile: sanitizeLayoutProfile(draft.mobile, defaultLayoutForDevice('mobile')),
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
    return true;
  },

  cancelEditorDraft: () => set({ editorDraft: null }),

  setEditorDevice: (device) => set({ editorDevice: device }),
}));

export function getActiveLayout(device: DeviceClass): LayoutNode {
  const { layoutProfiles, editorDraft } = useLayoutStore.getState();
  if (editorDraft) return editorDraft[device];
  return layoutProfiles[device];
}
