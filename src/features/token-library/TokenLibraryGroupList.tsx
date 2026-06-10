import type { TokenLibraryLayout } from '../../lib/types';
import {
  canDeleteGroup,
  createUserGroup,
  removeGroup,
  renameGroup,
  sortGroupsForDisplay,
  toggleGroupCollapsed,
} from '../../lib/tokenLibrary';
import { useLibraryDragScroll } from '../../hooks/useLibraryDragScroll';
import { useStore } from '../../store/useStore';
import { confirmAction } from '../confirm/confirmDialogStore';
import { TokenLibraryGroupSection } from './TokenLibraryGroupSection';

interface Props {
  layout: TokenLibraryLayout;
  scope: 'campaign' | 'global';
  assetUrls: Record<string, string>;
  onLayoutChange: (updater: (layout: TokenLibraryLayout) => TokenLibraryLayout) => void;
  onClearImport: () => void;
}

export function TokenLibraryGroupList({
  layout,
  scope,
  assetUrls,
  onLayoutChange,
  onClearImport,
}: Props) {
  const groups = sortGroupsForDisplay(layout.groups);
  const interactionMode = useStore((s) => s.interactionMode);
  const tokenLibraryEntryDragId = useStore((s) => s.tokenLibraryEntryDragId);
  const tokenLibraryDragOver = useStore((s) => s.tokenLibraryDragOver);
  const scrollActive =
    tokenLibraryEntryDragId != null ||
    (interactionMode === 'moving' && tokenLibraryDragOver);
  const { scrollRef, onDragOver } = useLibraryDragScroll(scrollActive);

  return (
    <div
      ref={scrollRef}
      data-token-library-scroll=""
      className="min-h-0 flex-1 overflow-y-auto"
      onDragOver={onDragOver}
    >
      {groups.map((group) => (
        <TokenLibraryGroupSection
          key={group.id}
          group={group}
          layout={layout}
          scope={scope}
          assetUrls={assetUrls}
          onToggleCollapse={() =>
            onLayoutChange((l) => toggleGroupCollapsed(l, group.id))
          }
          onRename={(name) => onLayoutChange((l) => renameGroup(l, group.id, name))}
          onDelete={
            canDeleteGroup(group)
              ? async () => {
                  const count = layout.entries.filter((e) => e.groupId === group.id).length;
                  const detail =
                    count > 0
                      ? ` ${count} token${count === 1 ? '' : 's'} in this group will be removed from the library.`
                      : '';
                  const confirmed = await confirmAction({
                    title: 'Delete group',
                    message: `Delete group "${group.name}"?${detail}`,
                    confirmLabel: 'Delete',
                    tone: 'danger',
                  });
                  if (!confirmed) return;
                  onLayoutChange((l) => removeGroup(l, group.id));
                }
              : undefined
          }
          onClearImport={group.kind === 'import' ? onClearImport : undefined}
          onScrollDragOver={onDragOver}
        />
      ))}
    </div>
  );
}

export { createUserGroup };
