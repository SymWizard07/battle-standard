import type { ModuleId } from './schema/layoutSchema';

export type LayoutPickMode = {
  active: boolean;
  /** Panel the user picks from (play area or token library). */
  sourceModuleId: ModuleId | null;
  /** Panel that owns the picker cancel control. */
  hostModuleId: ModuleId | null;
};

/** Resolve which layout modules participate in an active token/library pick. */
export function layoutPickModeFromFlags(flags: {
  initiativeTokenPickActive: boolean;
  importsTokenPickActive: boolean;
  libraryEntryPickActive: boolean;
}): LayoutPickMode {
  if (flags.libraryEntryPickActive) {
    return {
      active: true,
      sourceModuleId: 'tokens',
      hostModuleId: 'imports',
    };
  }
  if (flags.importsTokenPickActive) {
    return {
      active: true,
      sourceModuleId: 'canvas',
      hostModuleId: 'imports',
    };
  }
  if (flags.initiativeTokenPickActive) {
    return {
      active: true,
      sourceModuleId: 'canvas',
      hostModuleId: 'initiative',
    };
  }
  return { active: false, sourceModuleId: null, hostModuleId: null };
}

export type PickPanelRole = 'clear' | 'source' | 'host' | 'locked';

/** Role of a leaf panel (module, play area, or tabs group) during pick mode. */
export function pickPanelRole(
  moduleIds: readonly ModuleId[],
  pick: LayoutPickMode,
): PickPanelRole {
  if (!pick.active || !pick.sourceModuleId) return 'clear';
  const hasSource = moduleIds.includes(pick.sourceModuleId);
  const hasHost = pick.hostModuleId != null && moduleIds.includes(pick.hostModuleId);
  if (hasSource) return 'source';
  if (hasHost) return 'host';
  return 'locked';
}
