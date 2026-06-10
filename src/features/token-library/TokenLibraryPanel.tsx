import { useCallback, useEffect, useRef, useState } from 'react';
import { GLOBAL_CAMPAIGN_ID } from '../../lib/types';
import { loadCampaignAssets, saveAsset } from '../../lib/db';
import { isTokenLibraryAsset, mapAssetIdsInCampaign } from '../../lib/campaignAssets';
import { newId } from '../../lib/ids';
import {
  IMPORT_GROUP_ID,
  addAssetEntryToGroup,
  defaultTokenLibraryLayout,
} from '../../lib/tokenLibrary';
import type { TokenLibraryLayout } from '../../lib/types';
import { plainTokenName } from '../../lib/tokenNameMarkup';
import { useStore } from '../../store/useStore';
import { confirmAction } from '../confirm/confirmDialogStore';
import { TokenLibraryGroupList, createUserGroup } from './TokenLibraryGroupList';
import { TokenLibraryDeleteZone } from './TokenLibraryDeleteZone';

interface Props {
  variant: 'sidebar' | 'sheet' | 'inline' | 'module';
  open: boolean;
  onClose: () => void;
}

export function TokenLibraryPanel({ variant, open, onClose }: Props) {
  const campaign = useStore((s) => s.campaign);
  const rightCollapsed = useStore((s) => s.rightCollapsed);
  const registerAssetUrl = useStore((s) => s.registerAssetUrl);
  const assetUrls = useStore((s) => s.assetUrls);
  const globalTokenLibraryLayout = useStore((s) => s.globalTokenLibraryLayout);
  const loadGlobalTokenLibraryLayout = useStore((s) => s.loadGlobalTokenLibraryLayout);
  const updateCampaignTokenLibrary = useStore((s) => s.updateCampaignTokenLibrary);
  const updateGlobalTokenLibrary = useStore((s) => s.updateGlobalTokenLibrary);
  const clearImportGroup = useStore((s) => s.clearImportGroup);
  const cancelTokenMove = useStore((s) => s.cancelTokenMove);
  const interactionMode = useStore((s) => s.interactionMode);
  const tokenLibraryDragOver = useStore((s) => s.tokenLibraryDragOver);
  const tokenDragOffMap = useStore((s) => s.tokenDragOffMap);
  const tokenLibraryDropTargetGroupId = useStore((s) => s.tokenLibraryDropTargetGroupId);
  const tokenLibraryDropOverDelete = useStore((s) => s.tokenLibraryDropOverDelete);
  const setTokenLibraryDropTargetGroupId = useStore((s) => s.setTokenLibraryDropTargetGroupId);
  const setTokenLibraryDropOverDelete = useStore((s) => s.setTokenLibraryDropOverDelete);
  const tokenLibraryEntryDragId = useStore((s) => s.tokenLibraryEntryDragId);
  const discardTokenToLibraryTrash = useStore((s) => s.discardTokenToLibraryTrash);
  const deleteLibraryEntry = useStore((s) => s.deleteLibraryEntry);
  const endLibraryEntryDrag = useStore((s) => s.endLibraryEntryDrag);
  const selectedTokenIds = useStore((s) => s.selectedTokenIds);
  const [tab, setTab] = useState<'campaign' | 'global'>('campaign');
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const scope = tab === 'global' ? 'global' : 'campaign';
  const campaignLayout = campaign?.tokenLibrary ?? defaultTokenLibraryLayout([]);
  const layout = scope === 'global' ? (globalTokenLibraryLayout ?? defaultTokenLibraryLayout([])) : campaignLayout;
  const draggingFromMap = interactionMode === 'moving' && selectedTokenIds.length > 0;
  const showDeleteZone = draggingFromMap || tokenLibraryEntryDragId != null;

  useEffect(() => {
    if (interactionMode !== 'moving') {
      document.body.style.cursor = '';
      return;
    }

    if (!tokenLibraryDragOver && tokenDragOffMap) {
      document.body.style.cursor = 'grabbing';
      return () => {
        document.body.style.cursor = '';
      };
    }

    if (!tokenLibraryDragOver) return;

    let cursor = 'grabbing';
    if (tokenLibraryDropOverDelete) {
      cursor = 'not-allowed';
    } else if (tokenLibraryDropTargetGroupId) {
      const group = layout.groups.find((g) => g.id === tokenLibraryDropTargetGroupId);
      if (group?.kind === 'templates') cursor = 'not-allowed';
      else cursor = 'copy';
    }

    document.body.style.cursor = cursor;
    return () => {
      document.body.style.cursor = '';
    };
  }, [
    interactionMode,
    tokenLibraryDragOver,
    tokenDragOffMap,
    tokenLibraryDropTargetGroupId,
    tokenLibraryDropOverDelete,
    layout.groups,
  ]);

  const refreshAssetUrls = useCallback(async () => {
    const cid = tab === 'global' ? GLOBAL_CAMPAIGN_ID : campaign?.id;
    if (!cid) return;
    const list = await loadCampaignAssets(cid);
    const mapIds = mapAssetIdsInCampaign(campaign);
    for (const a of list.filter((asset) => isTokenLibraryAsset(asset, mapIds))) {
      if (!useStore.getState().assetUrls[a.id]) {
        registerAssetUrl(a.id, URL.createObjectURL(a.blob));
      }
    }
  }, [tab, campaign, registerAssetUrl]);

  useEffect(() => {
    void refreshAssetUrls();
  }, [refreshAssetUrls]);

  useEffect(() => {
    if (tab === 'global') {
      void loadGlobalTokenLibraryLayout();
    }
  }, [tab, loadGlobalTokenLibraryLayout]);

  const onLayoutChange = useCallback(
    (updater: (layout: TokenLibraryLayout) => TokenLibraryLayout) => {
      if (scope === 'campaign') {
        updateCampaignTokenLibrary(updater);
      } else {
        updateGlobalTokenLibrary(updater);
      }
    },
    [scope, updateCampaignTokenLibrary, updateGlobalTokenLibrary],
  );

  const upload = async (file: File) => {
    const cid = tab === 'global' ? GLOBAL_CAMPAIGN_ID : campaign?.id;
    if (!cid) return;
    const assetId = newId();
    await saveAsset({
      id: assetId,
      campaignId: cid,
      blob: file,
      mimeType: file.type,
      name: file.name,
      createdAt: Date.now(),
      kind: 'token',
    });
    registerAssetUrl(assetId, URL.createObjectURL(file));
    onLayoutChange((l) => addAssetEntryToGroup(l, IMPORT_GROUP_ID, assetId, file.name, true));
  };

  const panel = (
    <div
      ref={panelRef}
      data-token-library=""
      className={`flex h-full flex-col bg-slate-900 ${
        draggingFromMap && tokenLibraryDragOver ? 'cursor-grabbing' : ''
      }`}
      onPointerLeave={() => {
        if (interactionMode !== 'moving') return;
        setTokenLibraryDropTargetGroupId(null);
        setTokenLibraryDropOverDelete(false);
      }}
      onPointerUp={(e) => {
        if (interactionMode !== 'moving') return;
        const target = e.target as HTMLElement;
        if (target.closest('[data-token-library-delete-zone]')) return;
        if (!target.closest('[data-token-library-group]')) {
          cancelTokenMove();
        }
      }}
    >
      {variant !== 'inline' && (
        <header className="safe-top flex items-center justify-between border-b border-slate-700 px-3 py-2">
          <h2 className="text-sm font-semibold">Tokens</h2>
          <div className="flex gap-1">
            {variant === 'sheet' && (
              <button
                type="button"
                className="min-h-9 min-w-9 rounded-lg bg-slate-800 md:hidden"
                onClick={onClose}
              >
                ✕
              </button>
            )}
          </div>
        </header>
      )}

      {(variant === 'inline' || variant === 'module' || !rightCollapsed) && (
        <>
          <div className="flex border-b border-slate-700">
            <button
              type="button"
              className={`min-h-11 flex-1 text-sm ${tab === 'campaign' ? 'bg-slate-800' : ''}`}
              onClick={() => setTab('campaign')}
            >
              Campaign
            </button>
            <button
              type="button"
              className={`min-h-11 flex-1 text-sm ${tab === 'global' ? 'bg-slate-800' : ''}`}
              onClick={() => setTab('global')}
            >
              Global
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <TokenLibraryGroupList
              layout={layout}
              scope={scope}
              assetUrls={assetUrls}
              onLayoutChange={onLayoutChange}
              onClearImport={() => void clearImportGroup(scope)}
            />

            <TokenLibraryDeleteZone
              active={showDeleteZone}
              onDropMapToken={() => {
                if (interactionMode === 'moving') discardTokenToLibraryTrash();
              }}
              onDropLibraryEntry={async (entryId) => {
                const entry = layout.entries.find((e) => e.id === entryId);
                const label = entry ? plainTokenName(entry.name) : 'this token';
                const confirmed = await confirmAction({
                  title: 'Remove token',
                  message: `Remove "${label}" from the library?`,
                  confirmLabel: 'Remove',
                  tone: 'danger',
                });
                if (!confirmed) {
                  endLibraryEntryDrag();
                  return;
                }
                deleteLibraryEntry(scope, entryId);
              }}
            />
          </div>

          <footer className="safe-bottom border-t border-slate-700">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
            <div className="flex divide-x divide-slate-700">
              <button
                type="button"
                className="min-h-11 flex-1 text-sm font-medium hover:bg-slate-800"
                onClick={() => fileRef.current?.click()}
              >
                Upload token
              </button>
              <button
                type="button"
                className="min-h-11 flex-1 text-sm font-medium hover:bg-slate-800"
                onClick={() => onLayoutChange(createUserGroup)}
              >
                New Group
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );

  if (variant === 'sidebar') {
    if (rightCollapsed) return null;
    return (
      <aside className="hidden h-full w-72 shrink-0 border-l border-slate-700 md:flex md:flex-col">
        {panel}
      </aside>
    );
  }

  if (variant === 'inline' || variant === 'module') {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden border-slate-700 md:border-l">
        {panel}
      </div>
    );
  }

  if (!open) return null;
  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/50 md:hidden"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[60vh] rounded-t-2xl border-t border-slate-600 md:hidden">
        {panel}
      </div>
    </>
  );
}
