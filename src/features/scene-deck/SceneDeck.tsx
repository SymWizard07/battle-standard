import { useState } from 'react';
import type { SceneDeckNode } from '../../lib/types';
import { useStore } from '../../store/useStore';
import { pushSceneToPlayers } from '../../sync/yjsProvider';
import { confirmAction } from '../confirm/confirmDialogStore';
import { APP_TITLE } from '../../hooks/useDocumentTitle';
import { InfoModal } from '../settings/InfoModal';
import { useSettingsUiStore } from '../settings/settingsUiStore';
import { InfoIcon, SettingsIcon } from '../settings/SettingsIcons';
import { ScenePreview } from './ScenePreview';

interface Props {
  open: boolean;
  onClose: () => void;
  variant: 'sheet' | 'sidebar' | 'inline' | 'module';
  collapsed?: boolean;
}

function flattenScenes(nodes: SceneDeckNode[]): string[] {
  const ids: string[] = [];
  for (const n of nodes) {
    if (n.type === 'scene') ids.push(n.sceneId);
    else ids.push(...flattenScenes(n.children));
  }
  return ids;
}

export function SceneDeck({
  open,
  onClose,
  variant,
  collapsed = false,
}: Props) {
  const campaign = useStore((s) => s.campaign);
  const activeSceneId = useStore((s) => s.activeSceneId);
  const setActiveScene = useStore((s) => s.setActiveScene);
  const addScene = useStore((s) => s.addScene);
  const removeScene = useStore((s) => s.removeScene);
  const renameScene = useStore((s) => s.renameScene);
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const isGm = role === 'gm' && !playerView;
  const syncStatus = useStore((s) => s.syncStatus);
  const scenePreviewUrls = useStore((s) => s.scenePreviewUrls);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const setSettingsOpen = useSettingsUiStore((s) => s.setOpen);
  const [infoOpen, setInfoOpen] = useState(false);

  if (!campaign) return null;

  const sceneIds = flattenScenes(campaign.sceneDeck);
  const isCompact = variant === 'inline' || variant === 'sheet';
  const showBody = variant === 'inline' || variant === 'sheet' || variant === 'module' || !collapsed;

  const handleAddScene = () => {
    addScene(`Scene ${sceneIds.length + 1}`);
  };

  const handleDeleteScene = async (sceneId: string, sceneName: string) => {
    const confirmed = await confirmAction({
      title: 'Delete scene',
      message: `Delete "${sceneName}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    removeScene(sceneId);
  };

  const panel = (
    <div className="flex h-full flex-col bg-slate-900">
      {variant !== 'inline' && (
      <header className="safe-top flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <h2 className="text-sm font-semibold">Scenes</h2>
        <div className="flex gap-1">
          {variant === 'sheet' && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-9 min-w-9 rounded-lg bg-slate-800 text-lg md:hidden"
              aria-label="Close scenes"
            >
              ✕
            </button>
          )}
        </div>
      </header>
      )}

      {showBody && (
      <ul
        className={
          isCompact
            ? 'grid max-h-[9.75rem] auto-rows-min grid-cols-4 gap-1 overflow-y-auto p-1.5'
            : 'flex-1 overflow-y-auto p-2'
        }
      >
        {sceneIds.map((id) => {
          const scene = campaign.scenes[id];
          if (!scene) return null;
          const active = id === activeSceneId;
          return (
            <li
              key={id}
              className={`${isCompact ? '' : 'mb-1'} ${renaming === id && isCompact ? 'col-span-4' : ''}`}
            >
              {renaming === id ? (
                <form
                  className={isCompact ? 'flex gap-1 p-1' : 'flex gap-2 p-2'}
                  onSubmit={(e) => {
                    e.preventDefault();
                    renameScene(id, renameValue.trim() || scene.name);
                    setRenaming(null);
                  }}
                >
                  <input
                    className={
                      isCompact
                        ? 'min-h-8 flex-1 rounded border border-slate-600 bg-slate-800 px-2 text-xs'
                        : 'min-h-11 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3'
                    }
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className={
                      isCompact
                        ? 'min-h-8 rounded bg-sky-600 px-2 text-xs'
                        : 'min-h-11 rounded-lg bg-sky-600 px-3'
                    }
                  >
                    Save
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setActiveScene(id);
                    if (isGm && syncStatus === 'connected') {
                      pushSceneToPlayers();
                    }
                    onClose();
                  }}
                  className={`relative flex w-full flex-col text-left ${
                    isCompact
                      ? `gap-0.5 rounded-md p-0.5 ${active ? 'bg-sky-600/30 ring-1 ring-sky-500' : 'bg-slate-800'}`
                      : `gap-2 rounded-xl p-2 text-sm ${active ? 'bg-sky-600/30 ring-2 ring-sky-500' : 'bg-slate-800 hover:bg-slate-750'}`
                  }`}
                >
                  <ScenePreview previewUrl={scenePreviewUrls[id]} compact={isCompact} />
                  <span
                    className={`truncate font-medium leading-tight ${
                      isCompact ? 'px-0.5 text-[9px]' : 'px-1 text-sm'
                    }`}
                    title={scene.name}
                  >
                    {scene.name}
                  </span>
                  {isCompact && isGm && (
                    <span
                      className="absolute right-0.5 top-0.5 flex gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="min-h-5 min-w-5 rounded bg-slate-900/80 text-[9px] text-slate-300"
                        aria-label={`Rename ${scene.name}`}
                        onClick={() => {
                          setRenaming(id);
                          setRenameValue(scene.name);
                        }}
                      >
                        ✎
                      </button>
                      {sceneIds.length > 1 && (
                        <button
                          type="button"
                          className="min-h-5 min-w-5 rounded bg-slate-900/80 text-[9px] text-red-400"
                          aria-label={`Delete ${scene.name}`}
                          onClick={() => handleDeleteScene(id, scene.name)}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  )}
                </button>
              )}
              {isGm && !isCompact && renaming !== id && (
                <div className="mt-1 flex gap-2 px-2">
                  <button
                    type="button"
                    className="text-xs text-slate-400 underline"
                    onClick={() => {
                      setRenaming(id);
                      setRenameValue(scene.name);
                    }}
                  >
                    Rename
                  </button>
                  {sceneIds.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-400 underline"
                      onClick={() => handleDeleteScene(id, scene.name)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {isGm && (
          <li key="__add-scene" className={isCompact ? '' : 'mb-1'}>
            <button
              type="button"
              onClick={handleAddScene}
              aria-label="Add scene"
              className={`flex w-full flex-col text-left ${
                isCompact
                  ? 'gap-0.5 rounded-md p-0.5 bg-slate-800'
                  : 'gap-2 rounded-xl p-2 text-sm bg-slate-800 hover:bg-slate-750'
              }`}
            >
              <div
                className={`flex aspect-video w-full items-center justify-center bg-slate-700 ${
                  isCompact ? 'rounded-sm' : 'rounded-lg'
                }`}
              >
                <span
                  className={`font-light leading-none text-slate-400 ${
                    isCompact ? 'text-xl' : 'text-3xl'
                  }`}
                >
                  +
                </span>
              </div>
              <span
                className={`truncate font-medium leading-tight text-slate-400 ${
                  isCompact ? 'px-0.5 text-[9px]' : 'px-1 text-sm'
                }`}
              >
                Add scene
              </span>
            </button>
          </li>
        )}
      </ul>
      )}

      {(variant === 'inline' || variant === 'module' || !collapsed) && !isCompact && (
        <footer className="safe-bottom border-t border-slate-700 p-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Settings (Ctrl+,)"
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 font-medium text-slate-200 hover:bg-slate-750"
            >
              <SettingsIcon />
              Settings
            </button>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-750"
              aria-label={`How to use ${APP_TITLE}`}
            >
              <InfoIcon />
            </button>
          </div>
        </footer>
      )}

      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );

  if (variant === 'sidebar') {
    if (collapsed) return null;
    return (
      <aside className="hidden h-full w-72 shrink-0 border-r border-slate-700 md:flex md:flex-col">
        {panel}
      </aside>
    );
  }

  if (variant === 'inline' || variant === 'module') {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden border-slate-700 md:border-r">
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
        aria-label="Close overlay"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] rounded-t-2xl border-t border-slate-600 shadow-2xl md:hidden">
        {panel}
      </div>
    </>
  );
}
