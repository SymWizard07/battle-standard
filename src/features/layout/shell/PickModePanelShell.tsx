import type { ReactNode } from 'react';
import type { ModuleId } from '../schema/layoutSchema';
import {
  layoutPickModeFromFlags,
  pickPanelRole,
  type LayoutPickMode,
} from '../pickMode';
import { useStore } from '../../../store/useStore';

type Props = {
  moduleIds: readonly ModuleId[];
  children: ReactNode;
};

function useLayoutPickMode(): LayoutPickMode {
  const initiativeTokenPickActive = useStore((s) => s.initiativeTokenPickActive);
  const importsTokenPickActive = useStore((s) => s.importsTokenPickActive);
  const libraryEntryPickActive = useStore((s) => s.libraryEntryPickActive);
  return layoutPickModeFromFlags({
    initiativeTokenPickActive,
    importsTokenPickActive,
    libraryEntryPickActive,
  });
}

/**
 * Dims and blocks panels that aren't the pick source. Host panels stay
 * interactive so their cancel control works; they grey themselves internally.
 * Always uses a stable wrapper so toggling lock doesn't remount panel content
 * (e.g. play-area viewport / zoom).
 */
export function PickModePanelShell({ moduleIds, children }: Props) {
  const pick = useLayoutPickMode();
  const role = pickPanelRole(moduleIds, pick);
  const locked = role === 'locked';

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {children}
      {locked ? (
        <div
          className="absolute inset-0 z-[45] cursor-not-allowed bg-slate-950/55"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
