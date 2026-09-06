import { TOKEN_COLORS } from './campaignFactory';
import { templateTokenIconForColor } from './templateTokenIconSources';
import { newId } from './ids';
import type {
  TokenImageTransform,
  TokenLibraryDropPayload,
  TokenLibraryEntry,
  TokenLibraryGroup,
  TokenLibraryLayout,
  TokenOutlineStyle,
  TokenSheetSnapshot,
} from './types';

function cloneTokenSheet(sheet: TokenSheetSnapshot): TokenSheetSnapshot {
  return {
    ...sheet,
    ...(sheet.speeds ? { speeds: sheet.speeds.map((s) => ({ ...s })) } : {}),
    ...(sheet.skills ? { skills: sheet.skills.map((s) => ({ ...s })) } : {}),
  };
}

export const IMPORT_GROUP_ID = '__import__';
export const TEMPLATES_GROUP_ID = '__templates__';
export const DEFAULT_USER_GROUP_ID = '__tokens__';

export const BUILTIN_GROUP_NAMES: Record<string, string> = {
  [IMPORT_GROUP_ID]: 'Quick Import',
  [TEMPLATES_GROUP_ID]: 'Color Templates',
  [DEFAULT_USER_GROUP_ID]: 'My Tokens',
};

export function isBuiltinGroupId(groupId: string): boolean {
  return (
    groupId === IMPORT_GROUP_ID ||
    groupId === TEMPLATES_GROUP_ID ||
    groupId === DEFAULT_USER_GROUP_ID
  );
}

export function groupSectionTheme(group: TokenLibraryGroup): {
  section: string;
  header: string;
  body: string;
  nameClassName: string;
} {
  switch (group.kind) {
    case 'import':
      return {
        section: 'border-amber-900/40',
        header: 'bg-amber-950/40',
        body: 'bg-amber-950/25',
        nameClassName: 'text-sm font-semibold text-amber-100',
      };
    case 'templates':
      return {
        section: 'border-violet-900/40',
        header: 'bg-violet-950/40',
        body: 'bg-violet-950/25',
        nameClassName: 'text-sm font-semibold text-violet-100',
      };
    default:
      if (group.id === DEFAULT_USER_GROUP_ID) {
        return {
          section: 'border-sky-900/35',
          header: 'bg-sky-950/30',
          body: 'bg-sky-950/15',
          nameClassName: 'text-sm font-semibold text-sky-100',
        };
      }
      return {
        section: 'border-slate-700',
        header: 'bg-slate-800/70',
        body: 'bg-slate-900',
        nameClassName: 'text-sm font-medium text-slate-100',
      };
  }
}

export function sortGroupsForDisplay(groups: TokenLibraryGroup[]): TokenLibraryGroup[] {
  const kindOrder: Record<TokenLibraryGroup['kind'], number> = {
    import: 0,
    templates: 1,
    user: 2,
  };
  return [...groups].sort((a, b) => {
    const kd = kindOrder[a.kind] - kindOrder[b.kind];
    if (kd !== 0) return kd;
    return a.order - b.order;
  });
}

export function entriesForGroup(
  layout: TokenLibraryLayout,
  groupId: string,
): TokenLibraryEntry[] {
  return layout.entries
    .filter((e) => e.groupId === groupId)
    .sort((a, b) => a.order - b.order);
}

function nextEntryOrder(layout: TokenLibraryLayout, groupId: string, atStart = false): number {
  const groupEntries = entriesForGroup(layout, groupId);
  if (groupEntries.length === 0) return 0;
  if (atStart) return groupEntries[0]!.order - 1;
  return groupEntries[groupEntries.length - 1]!.order + 1;
}

export function defaultTokenLibraryLayout(existingAssetIds: string[] = []): TokenLibraryLayout {
  const groups: TokenLibraryGroup[] = [
    {
      id: IMPORT_GROUP_ID,
      name: BUILTIN_GROUP_NAMES[IMPORT_GROUP_ID]!,
      kind: 'import',
      collapsed: false,
      order: 0,
    },
    {
      id: TEMPLATES_GROUP_ID,
      name: BUILTIN_GROUP_NAMES[TEMPLATES_GROUP_ID]!,
      kind: 'templates',
      collapsed: false,
      order: 1,
    },
  ];

  const entries: TokenLibraryEntry[] = existingAssetIds.map((assetId, i) => ({
    id: newId(),
    groupId: IMPORT_GROUP_ID,
    kind: 'asset' as const,
    assetId,
    name: assetId,
    order: i,
  }));

  return { groups, entries };
}

export function ensureBuiltinGroups(layout: TokenLibraryLayout): TokenLibraryLayout {
  let groups = [...layout.groups];
  if (!groups.some((g) => g.id === IMPORT_GROUP_ID)) {
    groups.push({
      id: IMPORT_GROUP_ID,
      name: BUILTIN_GROUP_NAMES[IMPORT_GROUP_ID]!,
      kind: 'import',
      collapsed: false,
      order: 0,
    });
  }
  if (!groups.some((g) => g.id === TEMPLATES_GROUP_ID)) {
    groups.push({
      id: TEMPLATES_GROUP_ID,
      name: BUILTIN_GROUP_NAMES[TEMPLATES_GROUP_ID]!,
      kind: 'templates',
      collapsed: false,
      order: 1,
    });
  }
  return { ...layout, groups };
}

export function syncTokenLibraryLayout(
  layout: TokenLibraryLayout | undefined,
  existingAssetIds: string[],
): TokenLibraryLayout {
  const base = ensureBuiltinGroups(layout ?? defaultTokenLibraryLayout([]));
  const referenced = new Set(
    base.entries.filter((e) => e.kind === 'asset').map((e) => e.assetId),
  );
  const orphans = existingAssetIds.filter((id) => !referenced.has(id));
  if (orphans.length === 0) return base;

  const entries = [...base.entries];
  let order = nextEntryOrder(base, IMPORT_GROUP_ID);
  for (const assetId of orphans) {
    entries.push({
      id: newId(),
      groupId: IMPORT_GROUP_ID,
      kind: 'asset',
      assetId,
      name: assetId,
      order: order++,
    });
  }
  return { ...base, entries };
}

export function createUserGroup(layout: TokenLibraryLayout): TokenLibraryLayout {
  const userGroups = layout.groups.filter((g) => g.kind === 'user');
  const maxOrder = userGroups.reduce((m, g) => Math.max(m, g.order), -1);
  const group: TokenLibraryGroup = {
    id: newId(),
    name: 'New Group',
    kind: 'user',
    collapsed: false,
    order: maxOrder + 1,
  };
  return {
    ...layout,
    groups: [...layout.groups, group],
  };
}

export function toggleGroupCollapsed(
  layout: TokenLibraryLayout,
  groupId: string,
): TokenLibraryLayout {
  return {
    ...layout,
    groups: layout.groups.map((g) =>
      g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
    ),
  };
}

export function renameGroup(
  layout: TokenLibraryLayout,
  groupId: string,
  name: string,
): TokenLibraryLayout {
  return {
    ...layout,
    groups: layout.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
  };
}

export function addAssetEntryToGroup(
  layout: TokenLibraryLayout,
  groupId: string,
  assetId: string,
  name: string,
  atStart = false,
): TokenLibraryLayout {
  const order = nextEntryOrder(layout, groupId, atStart);
  const entry: TokenLibraryEntry = {
    id: newId(),
    groupId,
    kind: 'asset',
    assetId,
    name,
    order,
  };
  return {
    ...layout,
    entries: [...layout.entries, entry],
    groups: layout.groups.map((g) =>
      g.id === groupId && g.kind === 'import' ? { ...g, collapsed: false } : g,
    ),
  };
}

export function addTokenDropToGroup(
  layout: TokenLibraryLayout,
  groupId: string,
  payload: TokenLibraryDropPayload,
): TokenLibraryLayout {
  const order = nextEntryOrder(layout, groupId);
  let entry: TokenLibraryEntry;
  if (payload.imageAssetId) {
    entry = {
      id: newId(),
      groupId,
      kind: 'asset',
      assetId: payload.imageAssetId,
      name: payload.name,
      order,
      footprint: { ...payload.footprint },
      ...(payload.imageTransform
        ? {
            imageTransform: {
              offset: { ...payload.imageTransform.offset },
              size: { ...payload.imageTransform.size },
            },
          }
        : {}),
      ...(payload.outline
        ? {
            outline: {
              shape: payload.outline.shape,
              offset: { ...payload.outline.offset },
              size: { ...payload.outline.size },
            },
          }
        : {}),
      ...(payload.sheet ? { sheet: cloneTokenSheet(payload.sheet) } : {}),
    };
  } else {
    entry = {
      id: newId(),
      groupId,
      kind: 'color',
      color: payload.color,
      name: payload.name,
      footprint: { ...payload.footprint },
      order,
      ...(payload.sheet ? { sheet: cloneTokenSheet(payload.sheet) } : {}),
    };
  }
  return { ...layout, entries: [...layout.entries, entry] };
}

export function removeImportGroupEntries(layout: TokenLibraryLayout): {
  layout: TokenLibraryLayout;
  deletedAssetIds: string[];
} {
  const importEntries = entriesForGroup(layout, IMPORT_GROUP_ID);
  const deletedAssetIds = importEntries
    .filter((e) => e.kind === 'asset')
    .map((e) => e.assetId);
  return {
    layout: {
      ...layout,
      entries: layout.entries.filter((e) => e.groupId !== IMPORT_GROUP_ID),
    },
    deletedAssetIds,
  };
}

export function canDeleteGroup(group: TokenLibraryGroup): boolean {
  return group.kind !== 'import' && group.kind !== 'templates';
}

export function removeGroup(
  layout: TokenLibraryLayout,
  groupId: string,
): TokenLibraryLayout {
  const group = layout.groups.find((g) => g.id === groupId);
  if (group && !canDeleteGroup(group)) return layout;
  return {
    groups: layout.groups.filter((g) => g.id !== groupId),
    entries: layout.entries.filter((e) => e.groupId !== groupId),
  };
}

/** @deprecated Use canDeleteGroup */
export function canDeleteUserGroup(group: TokenLibraryGroup): boolean {
  return canDeleteGroup(group);
}

export function removeUserGroup(
  layout: TokenLibraryLayout,
  groupId: string,
): TokenLibraryLayout {
  return removeGroup(layout, groupId);
}

export function canAcceptLibraryEntryDrop(group: TokenLibraryGroup): boolean {
  return group.kind === 'user';
}

/** Map tokens and library reorganize drops — not Quick Import or templates. */
export function canAcceptMapTokenDrop(group: TokenLibraryGroup): boolean {
  return group.kind === 'user';
}

export function moveLibraryEntryToGroup(
  layout: TokenLibraryLayout,
  entryId: string,
  targetGroupId: string,
): TokenLibraryLayout {
  const entry = layout.entries.find((e) => e.id === entryId);
  if (!entry || entry.groupId === targetGroupId) return layout;
  const targetGroup = layout.groups.find((g) => g.id === targetGroupId);
  if (!targetGroup || !canAcceptLibraryEntryDrop(targetGroup)) return layout;

  const order = nextEntryOrder(layout, targetGroupId);
  return {
    ...layout,
    entries: layout.entries.map((e) =>
      e.id === entryId ? { ...e, groupId: targetGroupId, order } : e,
    ),
    groups: layout.groups.map((g) =>
      g.id === targetGroupId ? { ...g, collapsed: false } : g,
    ),
  };
}

export function copyTemplatePresetToGroup(
  layout: TokenLibraryLayout,
  groupId: string,
  templateColor: string,
  name: string,
): TokenLibraryLayout {
  const group = layout.groups.find((g) => g.id === groupId);
  if (!group || !canAcceptLibraryEntryDrop(group)) return layout;

  const order = nextEntryOrder(layout, groupId);
  const entry: TokenLibraryEntry = {
    id: newId(),
    groupId,
    kind: 'template',
    templateColor,
    name,
    order,
  };
  return {
    ...layout,
    entries: [...layout.entries, entry],
    groups: layout.groups.map((g) =>
      g.id === groupId ? { ...g, collapsed: false } : g,
    ),
  };
}

export function removeEntry(
  layout: TokenLibraryLayout,
  entryId: string,
): { layout: TokenLibraryLayout; deletedAssetId?: string } {
  const entry = layout.entries.find((e) => e.id === entryId);
  if (!entry) return { layout };
  return {
    layout: {
      ...layout,
      entries: layout.entries.filter((e) => e.id !== entryId),
    },
    deletedAssetId: entry.kind === 'asset' ? entry.assetId : undefined,
  };
}

const TEMPLATE_COLOR_LABELS = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Teal',
  'Blue',
  'Purple',
  'Pink',
] as const;

export function templateTokenDisplayName(templateColor: string): string {
  const icon = templateTokenIconForColor(templateColor);
  if (icon) return icon.displayName;
  const index = TOKEN_COLORS.findIndex(
    color => color.toLowerCase() === templateColor.toLowerCase(),
  );
  const label = index >= 0 ? TEMPLATE_COLOR_LABELS[index] : undefined;
  return label ? `${label} Token` : 'Token';
}

export const TEMPLATE_PRESETS = TOKEN_COLORS.map((color, i) => ({
  id: `template-${i}`,
  templateColor: color,
  name: templateTokenDisplayName(color),
}));

export function findTokenLibraryEntry(
  entryId: string,
  campaignLibrary: TokenLibraryLayout | null | undefined,
  globalLibrary: TokenLibraryLayout | null | undefined,
): TokenLibraryEntry | undefined {
  const fromCampaign = campaignLibrary?.entries.find((e) => e.id === entryId);
  if (fromCampaign) return fromCampaign;
  return globalLibrary?.entries.find((e) => e.id === entryId);
}

/** Update every asset entry with this assetId in a library layout. */
export function patchAssetEntriesAppearance(
  layout: TokenLibraryLayout,
  assetId: string,
  appearance: {
    footprint: { w: number; h: number };
    imageTransform: TokenImageTransform;
    outline: TokenOutlineStyle;
  },
): TokenLibraryLayout {
  let changed = false;
  const entries = layout.entries.map((e) => {
    if (e.kind !== 'asset' || e.assetId !== assetId) return e;
    changed = true;
    return {
      ...e,
      footprint: { ...appearance.footprint },
      imageTransform: {
        offset: { ...appearance.imageTransform.offset },
        size: { ...appearance.imageTransform.size },
      },
      outline: {
        shape: appearance.outline.shape,
        offset: { ...appearance.outline.offset },
        size: { ...appearance.outline.size },
      },
    };
  });
  return changed ? { ...layout, entries } : layout;
}
