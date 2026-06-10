import { useMemo, useState } from 'react';
import type { TokenLibraryGroup, TokenLibraryLayout } from '../../lib/types';
import { TEMPLATE_PRESETS, entriesForGroup, groupSectionTheme, canAcceptLibraryEntryDrop } from '../../lib/tokenLibrary';
import { InlineRenameField } from '../../components/InlineRenameField';
import { StyledTokenName } from '../../components/StyledTokenName';
import { plainTokenName } from '../../lib/tokenNameMarkup';
import { TemplateTokenThumb } from './TemplateTokenThumb';
import { TokenLibraryEntryThumb } from './TokenLibraryEntryThumb';
import { TokenLibraryMapDropPreview } from './TokenLibraryMapDropPreview';
import { TokenLibraryEntryDropPreview } from './TokenLibraryEntryDropPreview';
import { TokenLibraryEmptyDropSpacer } from './TokenLibraryEmptyDropSpacer';
import { useStore, getMovingTokenDropPayloads } from '../../store/useStore';

interface Props {
  group: TokenLibraryGroup;
  layout: TokenLibraryLayout;
  scope: 'campaign' | 'global';
  assetUrls: Record<string, string>;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onDelete?: () => void;
  onClearImport?: () => void;
  onScrollDragOver?: (e: React.DragEvent) => void;
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function TokenLibraryGroupSection({
  group,
  layout,
  scope,
  assetUrls,
  onToggleCollapse,
  onRename,
  onDelete,
  onClearImport,
  onScrollDragOver,
}: Props) {
  const tokenLibraryDragOver = useStore((s) => s.tokenLibraryDragOver);
  const tokenLibraryDropTargetGroupId = useStore((s) => s.tokenLibraryDropTargetGroupId);
  const setTokenLibraryDropTargetGroupId = useStore((s) => s.setTokenLibraryDropTargetGroupId);
  const setTokenLibraryDragOver = useStore((s) => s.setTokenLibraryDragOver);
  const tokenLibraryEntryDragId = useStore((s) => s.tokenLibraryEntryDragId);
  const interactionMode = useStore((s) => s.interactionMode);
  const campaign = useStore((s) => s.campaign);
  const activeSceneId = useStore((s) => s.activeSceneId);
  const selectedTokenIds = useStore((s) => s.selectedTokenIds);
  const movePreviewPositions = useStore((s) => s.movePreviewPositions);
  const saveTokenToLibraryGroup = useStore((s) => s.saveTokenToLibraryGroup);
  const moveLibraryEntryToGroup = useStore((s) => s.moveLibraryEntryToGroup);
  const copyTemplatePresetToLibraryGroup = useStore((s) => s.copyTemplatePresetToLibraryGroup);
  const beginLibraryEntryDrag = useStore((s) => s.beginLibraryEntryDrag);
  const endLibraryEntryDrag = useStore((s) => s.endLibraryEntryDrag);
  const [dropHighlight, setDropHighlight] = useState(false);

  const entries = entriesForGroup(layout, group.id);
  const draggingMapToken = interactionMode === 'moving';
  const draggingLibraryEntry = tokenLibraryEntryDragId != null;
  const acceptsLibraryEntry = canAcceptLibraryEntryDrop(group);
  const acceptsMapTokenDrop = group.kind !== 'templates';
  const draggedEntry = useMemo(() => {
    if (!tokenLibraryEntryDragId) return null;
    return layout.entries.find((e) => e.id === tokenLibraryEntryDragId) ?? null;
  }, [tokenLibraryEntryDragId, layout.entries]);
  const isEmptyGroup = entries.length === 0;
  const padEmptyGroupForMapDrag = draggingMapToken && acceptsMapTokenDrop && isEmptyGroup;
  const padEmptyGroupForEntryDrag =
    draggingLibraryEntry && acceptsLibraryEntry && isEmptyGroup;
  const padEmptyGroupForDrag = padEmptyGroupForMapDrag || padEmptyGroupForEntryDrag;
  const canDropMapToken = draggingMapToken && tokenLibraryDragOver;
  const isMapDropTarget = tokenLibraryDropTargetGroupId === group.id && acceptsMapTokenDrop;
  const isEntryDropTarget =
    draggingLibraryEntry &&
    acceptsLibraryEntry &&
    tokenLibraryDropTargetGroupId === group.id;
  const movingPayloads = useMemo(() => {
    if (!isMapDropTarget || !draggingMapToken) return [];
    return getMovingTokenDropPayloads(
      campaign,
      activeSceneId,
      movePreviewPositions,
      selectedTokenIds,
    );
  }, [
    isMapDropTarget,
    draggingMapToken,
    campaign,
    activeSceneId,
    movePreviewPositions,
    selectedTokenIds,
  ]);
  const showMapDropPreview = movingPayloads.length > 0;
  const showEntryDropPreview =
    isEntryDropTarget &&
    draggedEntry != null &&
    draggedEntry.groupId !== group.id;
  const showDropPreview = showMapDropPreview || showEntryDropPreview;
  const showNonTemplateBody =
    group.kind !== 'templates' && (!group.collapsed || padEmptyGroupForDrag);
  const importHasEntries = group.kind === 'import' && entries.length > 0;
  const canRenameGroup = group.kind === 'user';
  const theme = groupSectionTheme(group);

  const handlePointerDrop = () => {
    if (!canDropMapToken || !acceptsMapTokenDrop) return;
    saveTokenToLibraryGroup(scope, group.id);
    setDropHighlight(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    onScrollDragOver?.(e);
    const types = Array.from(e.dataTransfer.types);
    const isEntryDrag = types.includes('token-library-entry-id') || tokenLibraryEntryDragId != null;
    const isTemplateDrag = types.includes('token-template-color');

    if (isEntryDrag && acceptsLibraryEntry) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setTokenLibraryDropTargetGroupId(group.id);
      setDropHighlight(true);
      return;
    }

    if (!acceptsLibraryEntry) return;
    if (!isTemplateDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropHighlight(true);
  };

  const handleDragDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHighlight(false);
    setTokenLibraryDropTargetGroupId(null);

    const entryId = e.dataTransfer.getData('token-library-entry-id');
    if (entryId && acceptsLibraryEntry) {
      moveLibraryEntryToGroup(scope, entryId, group.id);
      endLibraryEntryDrag();
      return;
    }

    if (!acceptsLibraryEntry) return;

    const templateColor = e.dataTransfer.getData('token-template-color');
    if (templateColor) {
      const name = e.dataTransfer.getData('token-name') || 'Token';
      copyTemplatePresetToLibraryGroup(scope, group.id, templateColor, name);
    }
  };

  const mapDropCursor =
    draggingMapToken && isMapDropTarget
      ? 'cursor-copy'
      : draggingMapToken && tokenLibraryDropTargetGroupId === group.id && !acceptsMapTokenDrop
        ? 'cursor-not-allowed'
        : '';

  return (
    <section
      className={`border-b ${theme.section} ${mapDropCursor}`}
      data-token-library-group={group.id}
      onPointerEnter={() => {
        if (draggingMapToken) {
          setTokenLibraryDragOver(true);
          setTokenLibraryDropTargetGroupId(group.id);
          if (acceptsMapTokenDrop) setDropHighlight(true);
          return;
        }
      }}
      onPointerLeave={(e) => {
        if (!draggingMapToken) return;
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (tokenLibraryDropTargetGroupId === group.id) {
          setTokenLibraryDropTargetGroupId(null);
        }
        setDropHighlight(false);
      }}
      onPointerUp={handlePointerDrop}
      onDragOver={handleDragOver}
      onDragEnter={(e) => {
        const types = Array.from(e.dataTransfer.types);
        const isEntryDrag = types.includes('token-library-entry-id') || tokenLibraryEntryDragId != null;
        if (isEntryDrag && acceptsLibraryEntry) {
          e.preventDefault();
          setTokenLibraryDropTargetGroupId(group.id);
          setDropHighlight(true);
          return;
        }
        if (!acceptsLibraryEntry) return;
        if (types.includes('token-template-color')) {
          e.preventDefault();
          setDropHighlight(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDropHighlight(false);
        if (tokenLibraryDropTargetGroupId === group.id && draggingLibraryEntry) {
          setTokenLibraryDropTargetGroupId(null);
        }
      }}
      onDrop={handleDragDrop}
    >
      <div className={`flex items-center gap-1 px-2 py-2 ${theme.header}`}>
        <button
          type="button"
          className="flex h-9 w-4 shrink-0 items-center justify-center text-slate-400"
          onClick={onToggleCollapse}
          aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
        >
          {group.collapsed ? '▸' : '▾'}
        </button>
        <InlineRenameField
          value={group.name}
          canRename={canRenameGroup}
          styledDisplay={false}
          onRename={onRename}
          className="min-w-0 flex-1"
          nameClassName={theme.nameClassName}
          inputClassName="min-h-8 w-full rounded border border-slate-600 bg-slate-800 px-2 text-xs"
        />
        {onDelete && (
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-950/60 hover:text-red-400"
            onClick={onDelete}
            aria-label={`Delete group ${group.name}`}
            title="Delete group"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
        {importHasEntries && onClearImport && (
          <button
            type="button"
            className="shrink-0 px-2 text-xs text-slate-400 hover:text-slate-200"
            onClick={() => onClearImport()}
          >
            Clear
          </button>
        )}
      </div>

      {showNonTemplateBody && (
        <div
          className={`px-2 pb-3 transition-colors ${theme.body} ${
            dropHighlight || showDropPreview ? 'ring-1 ring-inset ring-sky-600/50' : ''
          }`}
        >
          <div className="grid grid-cols-3 gap-2">
            {!group.collapsed &&
              entries.map((entry) => (
                <TokenLibraryEntryThumb
                  key={entry.id}
                  entry={entry}
                  assetUrl={entry.kind === 'asset' ? assetUrls[entry.assetId] : undefined}
                  isDragging={entry.id === tokenLibraryEntryDragId}
                  onDragStart={() => beginLibraryEntryDrag(entry.id)}
                  onDragEnd={() => endLibraryEntryDrag()}
                />
              ))}
            {showMapDropPreview ? (
              <TokenLibraryMapDropPreview payloads={movingPayloads} assetUrls={assetUrls} />
            ) : showEntryDropPreview && draggedEntry ? (
              <TokenLibraryEntryDropPreview
                entry={draggedEntry}
                assetUrl={
                  draggedEntry.kind === 'asset' ? assetUrls[draggedEntry.assetId] : undefined
                }
              />
            ) : padEmptyGroupForDrag ? (
              <TokenLibraryEmptyDropSpacer />
            ) : null}
          </div>
        </div>
      )}

      {!group.collapsed && group.kind === 'templates' && (
        <div
          className={`px-2 pb-3 transition-colors ${theme.body} ${
            dropHighlight ? 'ring-1 ring-inset ring-sky-600/50' : ''
          }`}
        >
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATE_PRESETS.map((preset) => (
              <div
                key={preset.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('token-template-color', preset.templateColor);
                  e.dataTransfer.setData('token-name', preset.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="cursor-grab active:cursor-grabbing"
                title={plainTokenName(preset.name)}
              >
                <div className="aspect-square overflow-hidden rounded-lg border border-slate-600 bg-slate-800">
                  <TemplateTokenThumb
                    templateColor={preset.templateColor}
                    className="h-full w-full"
                  />
                </div>
                <StyledTokenName
                  value={preset.name}
                  className="mt-1 block truncate text-center text-[10px] leading-tight"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
