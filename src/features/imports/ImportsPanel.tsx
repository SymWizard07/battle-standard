import { useCallback, useEffect, useRef } from 'react';
import type { ImportsInspectTarget } from '../../lib/types';
import { inspectTargetFromMapToken } from '../../lib/importsInspect';
import { isTemplateTokenAssetId } from '../../lib/templateTokenImage';
import {
  canonicalFootprintFromAspect,
  cellRectFromOutline,
  cellRectFromTransform,
  defaultImageTransform,
  isCellRectCenteredOnFootprint,
  outlineFromCellRect,
  recenterCellRectOnFootprint,
  transformFromCellRect,
} from '../../lib/tokenImageFit';
import { useStore } from '../../store/useStore';
import { useDeviceClass } from '../layout/useDeviceClass';
import { useLayoutStore } from '../layout/layoutStore';
import {
  ImportsGridEditor,
  initialOutlineForImage,
  type ImportsGridEditorHandle,
} from './ImportsGridEditor';
import { BookIcon, EyedropperIcon } from '../initiative/InitiativeIcons';
import {
  ToolOptionButton,
  ToolOptionSegmentedControl,
  ToolOptionToggle,
} from '../toolbar/ToolOptionLayout';

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return (
      type === 'text' ||
      type === 'search' ||
      type === 'number' ||
      type === 'password' ||
      type === 'email' ||
      type === 'url' ||
      type === ''
    );
  }
  return false;
}

type InspectTarget = ImportsInspectTarget;

/**
 * Token image / outline inspector. Eyedropper picks map tokens; library pick
 * activates the Tokens module. Save writes to library entries + all map tokens
 * sharing the image asset.
 */
export function ImportsPanel() {
  const campaign = useStore((s) => s.campaign);
  const activeSceneId = useStore((s) => s.activeSceneId);
  const assetUrls = useStore((s) => s.assetUrls);
  const globalTokenLibraryLayout = useStore((s) => s.globalTokenLibraryLayout);
  const loadGlobalTokenLibraryLayout = useStore((s) => s.loadGlobalTokenLibraryLayout);
  const saveTokenAppearance = useStore((s) => s.saveTokenAppearance);

  const importsTokenPickActive = useStore((s) => s.importsTokenPickActive);
  const setImportsTokenPickActive = useStore((s) => s.setImportsTokenPickActive);
  const importsPendingPickTokenIds = useStore((s) => s.importsPendingPickTokenIds);
  const clearImportsPendingPick = useStore((s) => s.clearImportsPendingPick);
  const importsPickError = useStore((s) => s.importsPickError);
  const setImportsPickError = useStore((s) => s.setImportsPickError);

  const libraryEntryPickActive = useStore((s) => s.libraryEntryPickActive);
  const setLibraryEntryPickActive = useStore((s) => s.setLibraryEntryPickActive);

  const device = useDeviceClass();
  const activateModule = useLayoutStore((s) => s.activateModule);

  const editorRef = useRef<ImportsGridEditorHandle>(null);
  const target = useStore((s) => s.importsInspectTarget);
  const setTarget = useStore((s) => s.setImportsInspectTarget);
  const updateTarget = useStore((s) => s.updateImportsInspectTarget);
  const patchTargetStore = useStore((s) => s.patchImportsInspectTarget);
  const maintainAspect = useStore((s) => s.importsMaintainAspect);
  const setMaintainAspect = useStore((s) => s.setImportsMaintainAspect);
  const editOutline = useStore((s) => s.importsEditOutline);
  const setEditOutline = useStore((s) => s.setImportsEditOutline);
  const dirty = useStore((s) => s.importsInspectDirty);
  const setDirty = useStore((s) => s.setImportsInspectDirty);

  const focusEditor = useCallback(() => {
    activateModule(device, 'imports');
    // Wait for tab/editor mount after pick or module switch.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    });
  }, [activateModule, device]);

  useEffect(() => {
    void loadGlobalTokenLibraryLayout();
  }, [loadGlobalTokenLibraryLayout]);

  // Clear map eyedropper if Imports unmounts. Do not clear library pick —
  // From library switches to the Tokens tab and unmounts this panel while
  // the pick is still in progress.
  useEffect(() => {
    return () => {
      useStore.getState().setImportsTokenPickActive(false);
    };
  }, []);

  useEffect(() => {
    if (!importsPickError) return;
    const t = window.setTimeout(() => setImportsPickError(null), 4000);
    return () => window.clearTimeout(t);
  }, [importsPickError, setImportsPickError]);

  const canonicalSeededAssetId = useRef<string | null>(null);

  // Consume map eyedropper picks — restore last save when present.
  useEffect(() => {
    if (importsPendingPickTokenIds.length === 0 || !campaign || !activeSceneId) return;
    const tokenId = importsPendingPickTokenIds[0]!;
    const scene = campaign.scenes[activeSceneId];
    const token = scene?.tokens.find((t) => t.id === tokenId);
    clearImportsPendingPick();
    setImportsTokenPickActive(false);
    // Template / color-only tokens aren't editable in Appearance.
    if (!token?.imageAssetId) {
      setImportsPickError('Only imported images can be edited in Appearance.');
      return;
    }
    if (isTemplateTokenAssetId(token.imageAssetId)) {
      setImportsPickError(
        'Template tokens can’t be edited in Appearance. Pick an imported image instead.',
      );
      return;
    }
    setImportsPickError(null);

    const entry =
      campaign.tokenLibrary?.entries.find(
        (e) => e.kind === 'asset' && e.assetId === token.imageAssetId,
      ) ??
      globalTokenLibraryLayout?.entries.find(
        (e) => e.kind === 'asset' && e.assetId === token.imageAssetId,
      );

    const inCampaign = Boolean(
      entry && campaign.tokenLibrary?.entries.some((e) => e.id === entry.id),
    );
    canonicalSeededAssetId.current = null;
    setTarget(
      inspectTargetFromMapToken(
        { ...token, imageAssetId: token.imageAssetId },
        {
          scope: entry ? (inCampaign ? 'campaign' : 'global') : 'map',
          entryId: entry?.kind === 'asset' ? entry.id : undefined,
          libraryEntry: entry?.kind === 'asset' ? entry : undefined,
        },
      ),
    );
    setEditOutline(false);
    focusEditor();
  }, [
    importsPendingPickTokenIds,
    campaign,
    activeSceneId,
    globalTokenLibraryLayout,
    clearImportsPendingPick,
    setImportsTokenPickActive,
    setTarget,
    setEditOutline,
    focusEditor,
    setImportsPickError,
  ]);

  // Unsaved assets only: size editor footprint to natural aspect + outline.
  useEffect(() => {
    if (!target) {
      canonicalSeededAssetId.current = null;
      return;
    }
    if (!target.needsImageSeed) {
      canonicalSeededAssetId.current = target.assetId;
      return;
    }
    if (canonicalSeededAssetId.current === target.assetId) return;
    const url = assetUrls[target.assetId];
    if (!url) return;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (cancelled) return;
      if (canonicalSeededAssetId.current === target.assetId) return;
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      canonicalSeededAssetId.current = target.assetId;
      const aspect = image.naturalWidth / image.naturalHeight;
      const footprint = canonicalFootprintFromAspect(aspect);
      updateTarget((prev) =>
        prev.assetId === target.assetId && prev.needsImageSeed
          ? {
              ...prev,
              footprint,
              imageTransform: defaultImageTransform(footprint),
              outline: initialOutlineForImage(url, image, footprint),
              needsImageSeed: false,
            }
          : prev,
      );
      setDirty(false);
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [target?.assetId, target?.needsImageSeed, assetUrls, updateTarget, setDirty]);

  // Esc cancels pick modes
  useEffect(() => {
    if (!importsTokenPickActive && !libraryEntryPickActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setImportsTokenPickActive(false);
      setLibraryEntryPickActive(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    importsTokenPickActive,
    libraryEntryPickActive,
    setImportsTokenPickActive,
    setLibraryEntryPickActive,
  ]);

  const patchTarget = useCallback(
    (patch: Partial<InspectTarget>) => {
      patchTargetStore(patch);
    },
    [patchTargetStore],
  );

  const onSave = () => {
    if (!target) return;
    saveTokenAppearance(target.assetId, {
      footprint: target.footprint,
      imageTransform: target.imageTransform,
      outline: target.outline,
    });
    setDirty(false);
  };

  const pickModeActive = importsTokenPickActive || libraryEntryPickActive;

  const toggleEyedropper = () => {
    if (importsTokenPickActive) {
      setImportsTokenPickActive(false);
      return;
    }
    setLibraryEntryPickActive(false);
    setImportsTokenPickActive(true);
  };

  const toggleLibraryPick = () => {
    if (libraryEntryPickActive) {
      setLibraryEntryPickActive(false);
      return;
    }
    setImportsTokenPickActive(false);
    // Arm pick before switching tabs — Appearance unmounts when Tokens activates.
    setLibraryEntryPickActive(true);
    activateModule(device, 'tokens');
  };

  const imageUrl = target ? assetUrls[target.assetId] : undefined;

  const activeRect = target
    ? editOutline
      ? cellRectFromOutline(target.outline)
      : cellRectFromTransform(target.imageTransform)
    : null;
  const canRecenter =
    Boolean(target && activeRect) &&
    !isCellRectCenteredOnFootprint(target!.footprint, activeRect!);

  const recenterActive = () => {
    if (!target || !activeRect) return;
    const next = recenterCellRectOnFootprint(target.footprint, activeRect);
    if (editOutline) {
      patchTarget({ outline: outlineFromCellRect(next, target.outline.shape) });
    } else {
      patchTarget({ imageTransform: transformFromCellRect(next) });
    }
  };

  return (
    <div
      data-token-library=""
      data-imports-panel=""
      tabIndex={-1}
      className="flex h-full w-full flex-col overflow-hidden bg-slate-900 outline-none md:border-l md:border-slate-700"
      onKeyDown={(e) => {
        // Keep map/tool hotkeys from seeing keys while Imports owns focus.
        e.stopPropagation();
        if (e.key === 'Escape') {
          setImportsTokenPickActive(false);
          setLibraryEntryPickActive(false);
        }
        if (isTextEntryTarget(e.target)) return;
        if (
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === ' ' ||
          e.code === 'Space'
        ) {
          e.preventDefault();
        }
        if (!target) return;
        editorRef.current?.handleKeyDown(e);
      }}
      onKeyUp={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={
            pickModeActive ? 'pointer-events-none opacity-40' : undefined
          }
        >
          <div className="relative flex h-[min(52vh,22rem)] min-h-[14rem] w-full shrink-0 flex-col border-b border-slate-800">
            {target ? (
              <ImportsGridEditor
                ref={editorRef}
                imageUrl={imageUrl}
                footprint={target.footprint}
                imageTransform={target.imageTransform}
                outline={target.outline}
                editOutline={editOutline}
                maintainAspect={maintainAspect}
                label={target.name}
                onImageTransformChange={(imageTransform) =>
                  patchTarget({ imageTransform })
                }
                onOutlineChange={(outline) => patchTarget({ outline })}
                onFootprintChange={(footprint) => patchTarget({ footprint })}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-950/50 px-4 text-center text-sm text-slate-500">
                {importsPickError ? (
                  <p className="max-w-sm text-amber-200/95" role="alert">
                    {importsPickError}
                  </p>
                ) : (
                  <p>
                    Pick a map token or library image to inspect how it fits the
                    grid.
                  </p>
                )}
              </div>
            )}
            {target && importsPickError ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-amber-950/90 px-3 py-2 text-center text-xs text-amber-100"
                role="alert"
              >
                {importsPickError}
              </div>
            ) : null}
          </div>

          <div className="space-y-2 border-b border-slate-800 p-3">
            <div className="flex h-12 gap-1">
              <ToolOptionToggle
                label="Maintain aspect ratio"
                active={maintainAspect}
                onClick={() => setMaintainAspect(!maintainAspect)}
              />
              <ToolOptionButton
                label="Recenter"
                disabled={!canRecenter}
                onClick={recenterActive}
                title={
                  editOutline
                    ? 'Center the outline on the token footprint'
                    : 'Center the image on the token footprint'
                }
              />
            </div>

            <div className="flex h-12 gap-1">
              <ToolOptionToggle
                label="Edit selection outline"
                active={editOutline}
                disabled={!target}
                onClick={() => setEditOutline(!editOutline)}
              />
              <ToolOptionSegmentedControl
                className="min-w-0 flex-1"
                segments={[
                  {
                    id: 'circle',
                    label: 'Circle',
                    active: target?.outline.shape === 'circle',
                    disabled: !editOutline || !target,
                    onClick: () => {
                      if (!target) return;
                      patchTarget({
                        outline: {
                          ...target.outline,
                          shape: 'circle',
                          size: {
                            w: Math.max(
                              target.outline.size.w,
                              target.outline.size.h,
                            ),
                            h: Math.max(
                              target.outline.size.w,
                              target.outline.size.h,
                            ),
                          },
                        },
                      });
                    },
                  },
                  {
                    id: 'rect',
                    label: 'Rect',
                    active: target?.outline.shape === 'rect',
                    disabled: !editOutline || !target,
                    onClick: () => {
                      if (!target) return;
                      patchTarget({
                        outline: { ...target.outline, shape: 'rect' },
                      });
                    },
                  },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2 border-b border-slate-800 p-3">
          <div
            className="flex min-h-11 w-full overflow-hidden rounded-lg border-2 border-dashed border-slate-600 bg-slate-900/50"
            role="group"
            aria-label="Pick token appearance source"
          >
            <button
              type="button"
              onClick={toggleEyedropper}
              aria-pressed={importsTokenPickActive}
              title={
                importsTokenPickActive
                  ? 'Cancel (Esc)'
                  : 'Pick a token on the play area'
              }
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-none px-1.5 text-center text-[11px] font-medium leading-tight transition-colors ${
                importsTokenPickActive
                  ? 'bg-sky-600 text-white outline outline-2 outline-offset-[-2px] outline-sky-300'
                  : 'text-slate-400 hover:bg-sky-950/20 hover:text-sky-200'
              }`}
            >
              <EyedropperIcon className="h-4 w-4 shrink-0" />
              <span>
                {importsTokenPickActive ? 'Picking…' : 'From Play Area'}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleLibraryPick}
              aria-pressed={libraryEntryPickActive}
              title={
                libraryEntryPickActive
                  ? 'Cancel (Esc)'
                  : 'Open Tokens and pick a library entry'
              }
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-none border-l-2 border-dashed border-slate-600 px-1.5 text-center text-[11px] font-medium leading-tight transition-colors ${
                libraryEntryPickActive
                  ? 'bg-sky-600 text-white outline outline-2 outline-offset-[-2px] outline-sky-300'
                  : 'text-slate-400 hover:bg-sky-950/20 hover:text-sky-200'
              }`}
            >
              <BookIcon className="h-4 w-4 shrink-0" />
              <span>
                {libraryEntryPickActive ? 'Pick in Tokens…' : 'From library'}
              </span>
            </button>
          </div>

          <div
            className={`flex h-12 ${
              pickModeActive ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            <ToolOptionButton
              label="Save appearance"
              disabled={!target || !dirty}
              onClick={onSave}
              className={
                target && dirty
                  ? 'border-emerald-600/80 bg-emerald-900/40 text-emerald-100 hover:border-emerald-500 hover:bg-emerald-800/50'
                  : ''
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
