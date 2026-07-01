import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { STATUS_EFFECTS } from '../../lib/statusEffects';
import { TOKEN_VITALITY_STATES } from '../../lib/tokenVitality';
import { BloodiedStateIcon, DeadStateIcon } from './VitalityStateIcons';
import { getTokenScreenCenter } from '../../canvas/layers/TokenLayer';
import { primarySelectedTokenId, seesAsPlayer, useActiveScene, useLiveViewport, useStore } from '../../store/useStore';
import { canEditToken } from '../../sync/syncProvider';
import { tokenWorldTopLeft } from '../../lib/grid';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import { MAX_TOKEN_FOOTPRINT_CELLS } from '../../lib/tokenScale';
import { isTokenLockedForPlayers, isTokenVisibleToPlayers } from '../../lib/tokenVisibility';
import { InlineRenameField } from '../../components/InlineRenameField';
import { TokenNameSyntaxHint } from '../../components/TokenNameSyntaxHint';
import { FastTooltip } from './FastTooltip';
import type { GridCell, Point, StatusEffectId, Token, TokenGridPlacement, TokenVitalityState } from '../../lib/types';

function getTokenScreenCenterAtPlacement(
  token: { gridPos: GridCell; posOffset?: Point; footprint: { w: number; h: number } },
  placement: TokenGridPlacement,
  stagePos: { x: number; y: number },
  scale: number,
): { x: number; y: number } {
  const tl = tokenWorldTopLeft(placement);
  const w = token.footprint.w * GRID_SIZE_PX;
  const h = token.footprint.h * GRID_SIZE_PX;
  const cx = tl.x + w / 2;
  const cy = tl.y + h / 2;
  return {
    x: cx * scale + stagePos.x,
    y: cy * scale + stagePos.y,
  };
}

function getSelectionScreenAnchor(
  tokens: { id: string; gridPos: GridCell; posOffset?: Point; footprint: { w: number; h: number } }[],
  previewById: Record<string, TokenGridPlacement> | null,
  stagePos: { x: number; y: number },
  scale: number,
): { x: number; y: number; halfW: number; halfH: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const token of tokens) {
    const placement = previewById?.[token.id] ?? {
      gridPos: token.gridPos,
      posOffset: token.posOffset,
    };
    const tl = tokenWorldTopLeft(placement);
    const w = token.footprint.w * GRID_SIZE_PX;
    const h = token.footprint.h * GRID_SIZE_PX;
    minX = Math.min(minX, tl.x);
    minY = Math.min(minY, tl.y);
    maxX = Math.max(maxX, tl.x + w);
    maxY = Math.max(maxY, tl.y + h);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: cx * scale + stagePos.x,
    y: cy * scale + stagePos.y,
    halfW: ((maxX - minX) / 2) * scale,
    halfH: ((maxY - minY) / 2) * scale,
  };
}

function PlayerMoveLockIcon({
  locked,
  className,
}: {
  locked: boolean;
  className?: string;
}) {
  if (locked) {
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
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    );
  }
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
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-1" />
    </svg>
  );
}

function GmPlayerTokenControls({
  tokens,
  onToggleVisible,
  onToggleLock,
}: {
  tokens: Token[];
  onToggleVisible: (tokenIds: string[]) => void;
  onToggleLock: (tokenIds: string[]) => void;
}) {
  const visibleToPlayers = tokens.every(isTokenVisibleToPlayers);
  const lockedForPlayers = tokens.every(isTokenLockedForPlayers);
  const tokenIds = tokens.map((t) => t.id);
  const btn =
    'flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-1.5 text-xs font-medium';

  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        aria-pressed={visibleToPlayers}
        title={visibleToPlayers ? 'Players can see these tokens' : 'Hidden from players'}
        onClick={() => onToggleVisible(tokenIds)}
        className={`${btn} ${
          visibleToPlayers
            ? 'border-sky-400/80 bg-slate-800 text-slate-100'
            : 'border-slate-600 bg-slate-800/80 text-slate-400'
        }`}
      >
        <PlayerVisibilityIcon visible={visibleToPlayers} className="h-4 w-4 shrink-0" />
        <span className="truncate">{visibleToPlayers ? 'Visible' : 'Hidden'}</span>
      </button>
      <button
        type="button"
        aria-pressed={lockedForPlayers}
        title={
          lockedForPlayers
            ? 'Players cannot move these tokens'
            : 'Players can move these tokens'
        }
        onClick={() => onToggleLock(tokenIds)}
        className={`${btn} ${
          lockedForPlayers
            ? 'border-amber-400/80 bg-slate-800 text-slate-100'
            : 'border-slate-600 bg-slate-800/80 text-slate-400'
        }`}
      >
        <PlayerMoveLockIcon locked={lockedForPlayers} className="h-4 w-4 shrink-0" />
        <span className="truncate">{lockedForPlayers ? 'Locked' : 'Unlocked'}</span>
      </button>
    </div>
  );
}

function PlayerVisibilityIcon({
  visible,
  className,
}: {
  visible: boolean;
  className?: string;
}) {
  if (visible) {
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
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
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
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function VitalityControls({
  tokens,
  onToggleOne,
  onToggleMany,
}: {
  tokens: Token[];
  onToggleOne: (tokenId: string, state: TokenVitalityState) => void;
  onToggleMany: (tokenIds: string[], state: TokenVitalityState) => void;
}) {
  const multi = tokens.length > 1;
  const tokenIds = tokens.map((t) => t.id);

  return (
    <div className="mt-2 flex gap-2">
      {TOKEN_VITALITY_STATES.map((v) => {
        const on = multi
          ? tokens.every((t) => t.vitalityState === v.id)
          : tokens[0]?.vitalityState === v.id;
        return (
          <button
            key={v.id}
            type="button"
            title={v.label}
            aria-label={v.label}
            aria-pressed={on}
            onClick={() =>
              multi
                ? onToggleMany(tokenIds, v.id)
                : onToggleOne(tokens[0]!.id, v.id)
            }
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium ${
              on
                ? v.id === 'dead'
                  ? 'border-red-400 bg-red-950/50 text-red-100'
                  : 'border-red-400/80 bg-red-950/30 text-slate-100'
                : 'border-slate-600 bg-slate-800/80 text-slate-200'
            }`}
          >
            {v.id === 'bloodied' ? (
              <BloodiedStateIcon className="h-5 w-5 shrink-0" />
            ) : (
              <DeadStateIcon className="h-5 w-5 shrink-0 text-red-400" />
            )}
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusEffectControls({
  tokens,
  onToggleOne,
  onToggleMany,
}: {
  tokens: Token[];
  onToggleOne: (tokenId: string, status: StatusEffectId) => void;
  onToggleMany: (tokenIds: string[], status: StatusEffectId) => void;
}) {
  const multi = tokens.length > 1;
  const tokenIds = tokens.map((t) => t.id);

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {STATUS_EFFECTS.map((s) => {
        const on = multi
          ? tokens.every((t) => t.statusEffects.includes(s.id))
          : tokens[0]?.statusEffects.includes(s.id);
        return (
          <FastTooltip key={s.id} label={s.label}>
            <button
              type="button"
              aria-label={s.label}
              aria-pressed={on}
              onClick={() =>
                multi
                  ? onToggleMany(tokenIds, s.id)
                  : onToggleOne(tokens[0]!.id, s.id)
              }
              className={`flex h-10 w-10 items-center justify-center rounded-lg border p-1 ${
                on ? 'border-sky-400 bg-slate-700' : 'border-slate-600 bg-slate-800/80'
              }`}
            >
              <img
                src={s.icon}
                alt=""
                className="h-full w-full object-contain"
                draggable={false}
              />
            </button>
          </FastTooltip>
        );
      })}
    </div>
  );
}

function TransformControls({
  tokens,
  onUpdate,
}: {
  tokens: Token[];
  onUpdate: (tokenId: string, patch: Partial<Token>) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        className="min-h-11 rounded-lg bg-slate-700 px-2 text-sm"
        onClick={() => {
          for (const token of tokens) {
            onUpdate(token.id, { rotation: (token.rotation + 90) % 360 });
          }
        }}
      >
        ↻ 90°
      </button>
      <button
        type="button"
        className="min-h-11 rounded-lg bg-slate-700 px-2 text-sm"
        onClick={() => {
          for (const token of tokens) {
            onUpdate(token.id, {
              footprint: {
                w: Math.min(MAX_TOKEN_FOOTPRINT_CELLS, token.footprint.w + 1),
                h: Math.min(MAX_TOKEN_FOOTPRINT_CELLS, token.footprint.h + 1),
              },
            });
          }
        }}
      >
        +
      </button>
      <button
        type="button"
        className="min-h-11 rounded-lg bg-slate-700 px-2 text-sm"
        onClick={() => {
          for (const token of tokens) {
            onUpdate(token.id, {
              footprint: {
                w: Math.max(1, token.footprint.w - 1),
                h: Math.max(1, token.footprint.h - 1),
              },
            });
          }
        }}
      >
        −
      </button>
    </div>
  );
}

export function ContextPanel() {
  const scene = useActiveScene();
  const activeSceneId = useStore((s) => s.activeSceneId);
  const selectedTokenIds = useStore((s) => s.selectedTokenIds);
  const selectedTokenId = primarySelectedTokenId(selectedTokenIds);
  const selectedMeasurementId = useStore((s) => s.selectedMeasurementId);
  const interactionMode = useStore((s) => s.interactionMode);
  const tokenDragOffMap = useStore((s) => s.tokenDragOffMap);
  const movePreviewPos = useStore((s) => s.movePreviewPos);
  const movePreviewPositions = useStore((s) => s.movePreviewPositions);
  const setInteractionMode = useStore((s) => s.setInteractionMode);
  const setMovePreview = useStore((s) => s.setMovePreview);
  const liveViewport = useLiveViewport();
  const { x: stageX, y: stageY, scale } = liveViewport;
  const clearSelection = useStore((s) => s.clearSelection);
  const toggleStatus = useStore((s) => s.toggleStatus);
  const toggleVitalityState = useStore((s) => s.toggleVitalityState);
  const toggleStatusForTokens = useStore((s) => s.toggleStatusForTokens);
  const toggleVitalityStateForTokens = useStore((s) => s.toggleVitalityStateForTokens);
  const toggleVisibleToPlayersForTokens = useStore((s) => s.toggleVisibleToPlayersForTokens);
  const toggleLockedForPlayersForTokens = useStore((s) => s.toggleLockedForPlayersForTokens);
  const removeMeasurement = useStore((s) => s.removeMeasurement);
  const updateToken = useStore((s) => s.updateToken);
  const startTokenScale = useStore((s) => s.startTokenScale);
  const activeTool = useStore((s) => s.activeTool);
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const asPlayer = seesAsPlayer(role, playerView);
  const isGm = role === 'gm' && !asPlayer;
  const [pos, setPos] = useState({ x: 16, y: 80 });
  const [multiPanelHidden, setMultiPanelHidden] = useState(false);
  const [renamingTokenName, setRenamingTokenName] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastPreviewCellRef = useRef<GridCell | null>(null);
  const sideLeftRef = useRef(false);
  const clampMetaRef = useRef<{
    minX: number;
    maxX: number;
    paddedTokenLeft: number;
    paddedTokenRight: number;
    xLeft: number;
    xRight: number;
  } | null>(null);

  const selectedTokens =
    scene && selectedTokenIds.length > 0
      ? selectedTokenIds
          .map((id) => scene.tokens.find((t) => t.id === id))
          .filter((t): t is Token => t != null)
      : [];
  const editableTokens = selectedTokens.filter((t) => canEditToken(t));
  const multiSelect = selectedTokens.length > 1;
  const primaryToken =
    selectedTokenId && scene
      ? scene.tokens.find((t) => t.id === selectedTokenId)
      : selectedTokens[0] ?? null;
  const measurement =
    selectedMeasurementId && scene
      ? scene.measurements.find((m) => m.id === selectedMeasurementId)
      : null;

  useEffect(() => {
    setMultiPanelHidden(false);
    setRenamingTokenName(false);
  }, [selectedTokenIds.join(',')]);

  useEffect(() => {
    if (selectedTokens.length === 0 || !scene) return;
    const stagePos = { x: stageX, y: stageY };
    const moving = interactionMode === 'moving';
    const previews = moving ? movePreviewPositions : null;

    let anchor: { x: number; y: number };
    let tokenHalfWScreen: number;

    if (selectedTokens.length === 1 && primaryToken) {
      const token = primaryToken;
      const startCenter = getTokenScreenCenter(token, stagePos, scale);
      const previewCenter =
        moving && movePreviewPos
          ? getTokenScreenCenterAtPlacement(token, movePreviewPos, stagePos, scale)
          : null;
      anchor = previewCenter ?? startCenter;
      tokenHalfWScreen = (token.footprint.w * GRID_SIZE_PX * scale) / 2;
    } else {
      const bounds = getSelectionScreenAnchor(selectedTokens, previews, stagePos, scale);
      anchor = { x: bounds.x, y: bounds.y };
      tokenHalfWScreen = bounds.halfW;
    }

    let placeLeft = sideLeftRef.current;
    if (moving && primaryToken) {
      const previewPlacement =
        movePreviewPositions?.[primaryToken.id] ??
        movePreviewPos ?? {
          gridPos: primaryToken.gridPos,
          posOffset: primaryToken.posOffset,
        };
      const last = lastPreviewCellRef.current;
      if (last) {
        const dcol = previewPlacement.gridPos.col - last.col;
        if (dcol !== 0) {
          placeLeft = dcol > 0;
          sideLeftRef.current = placeLeft;
        }
      }
      lastPreviewCellRef.current = previewPlacement.gridPos;
    } else {
      lastPreviewCellRef.current = null;
    }

    const panelW = panelRef.current?.getBoundingClientRect().width ?? 220;
    const panelH = 200;
    const edgePadding = Math.max(10, 14 * scale);
    const pad = 8;
    const parent = panelRef.current?.offsetParent as HTMLElement | null;
    const pr = parent?.getBoundingClientRect();
    const parentW = pr?.width ?? window.innerWidth;
    const parentH = pr?.height ?? window.innerHeight;
    const minX = pad;
    const maxX = parentW - panelW - pad;

    const paddedTokenLeft = anchor.x - tokenHalfWScreen - edgePadding;
    const paddedTokenRight = anchor.x + tokenHalfWScreen + edgePadding;
    const xLeftRaw = anchor.x - tokenHalfWScreen - edgePadding - panelW;
    const xRightRaw = anchor.x + tokenHalfWScreen + edgePadding;

    const clampX = (raw: number) => Math.min(maxX, Math.max(minX, raw));
    const overlapAmount = (x0: number) => {
      const left = x0;
      const right = x0 + panelW;
      const overlap = Math.min(right, paddedTokenRight) - Math.max(left, paddedTokenLeft);
      return Math.max(0, overlap);
    };

    const xLeft = clampX(xLeftRaw);
    const xRight = clampX(xRightRaw);
    const leftOverlap = overlapAmount(xLeft);
    const rightOverlap = overlapAmount(xRight);

    let x = placeLeft ? xLeft : xRight;
    if (placeLeft) {
      if (leftOverlap > 0 && rightOverlap === 0) {
        placeLeft = false;
      } else if (leftOverlap > 0 && rightOverlap > 0 && rightOverlap < leftOverlap) {
        placeLeft = false;
      }
    } else {
      if (rightOverlap > 0 && leftOverlap === 0) {
        placeLeft = true;
      } else if (rightOverlap > 0 && leftOverlap > 0 && leftOverlap < rightOverlap) {
        placeLeft = true;
      }
    }
    sideLeftRef.current = placeLeft;
    x = placeLeft ? xLeft : xRight;

    clampMetaRef.current = { minX, maxX, paddedTokenLeft, paddedTokenRight, xLeft, xRight };
    const y = Math.min(parentH - panelH - pad, Math.max(pad, anchor.y - 40));
    setPos({ x: Math.round(x), y: Math.round(y) });
  }, [
    selectedTokenIds,
    scene,
    stageX,
    stageY,
    scale,
    interactionMode,
    movePreviewPos,
    movePreviewPositions,
  ]);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const pad = 8;
    const r = el.getBoundingClientRect();
    let nx = pos.x;
    let ny = pos.y;

    const parent = el.offsetParent as HTMLElement | null;
    const pr = parent?.getBoundingClientRect();
    if (!pr) return;

    const left = r.left - pr.left;
    const right = r.right - pr.left;
    const top = r.top - pr.top;
    const bottom = r.bottom - pr.top;

    if (left < pad) nx += pad - left;
    if (top < pad) ny += pad - top;
    if (right > pr.width - pad) nx -= right - (pr.width - pad);
    if (bottom > pr.height - pad) ny -= bottom - (pr.height - pad);

    nx = Math.round(nx);
    ny = Math.round(ny);
    if (nx !== pos.x || ny !== pos.y) {
      setPos({ x: nx, y: ny });
    }
  }, [pos.x, pos.y, selectedTokens.length, measurement]);

  if (!selectedTokens.length && !measurement) return null;

  if (measurement && activeSceneId) {
    return (
      <div
        ref={panelRef}
        className="pointer-events-auto absolute z-20 w-52 rounded-xl border border-slate-600 bg-slate-900/95 p-3 shadow-xl"
        style={{ left: pos.x, top: pos.y }}
      >
        <p className="text-sm font-semibold capitalize">{measurement.kind}</p>
        <button
          type="button"
          className="mt-2 min-h-11 w-full rounded-lg bg-red-900/80 text-sm"
          onClick={() => removeMeasurement(activeSceneId, measurement.id)}
        >
          Delete
        </button>
        <button
          type="button"
          className="mt-2 min-h-11 w-full rounded-lg bg-slate-700 text-sm"
          onClick={clearSelection}
        >
          Done
        </button>
      </div>
    );
  }

  if (!activeSceneId || selectedTokens.length === 0) return null;
  if (multiSelect && multiPanelHidden) return null;

  const movingToken = interactionMode === 'moving';
  const scalingToken = interactionMode === 'scaling';
  if (movingToken && tokenDragOffMap) return null;
  if (scalingToken) return null;
  const isCoarsePointer =
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;
  const showTransform =
    editableTokens.length > 0 && activeTool === 'transform' && !movingToken;

  const applyStatusForTokens = (tokenIds: string[], status: StatusEffectId) => {
    const editableIds = tokenIds.filter((id) => {
      const t = selectedTokens.find((tok) => tok.id === id);
      return t && canEditToken(t);
    });
    if (editableIds.length === 0) return;
    if (editableIds.length === 1) {
      toggleStatus(activeSceneId, editableIds[0]!, status);
    } else {
      toggleStatusForTokens(activeSceneId, editableIds, status);
    }
  };

  const applyVitalityForTokens = (tokenIds: string[], state: TokenVitalityState) => {
    const editableIds = tokenIds.filter((id) => {
      const t = selectedTokens.find((tok) => tok.id === id);
      return t && canEditToken(t);
    });
    if (editableIds.length === 0) return;
    if (editableIds.length === 1) {
      toggleVitalityState(activeSceneId, editableIds[0]!, state);
    } else {
      toggleVitalityStateForTokens(activeSceneId, editableIds, state);
    }
  };

  const panelWidth = panelRef.current?.getBoundingClientRect().width ?? 224;
  const hintWidth = 168;
  const hintGap = 8;
  const hintLeft = sideLeftRef.current
    ? Math.max(8, pos.x - hintWidth - hintGap)
    : pos.x + panelWidth + hintGap;

  return (
    <>
      {!multiSelect && renamingTokenName && (
        <div
          className="pointer-events-none absolute z-20 w-42 rounded-xl border border-slate-600 bg-slate-900/95 p-2 shadow-xl"
          style={{ left: hintLeft, top: pos.y, width: hintWidth }}
        >
          <TokenNameSyntaxHint showTitle />
        </div>
      )}
      <div
        ref={panelRef}
        className={`absolute z-20 w-56 max-h-[50vh] overflow-y-auto rounded-xl border border-slate-600 bg-slate-900/95 p-3 shadow-xl ${
          movingToken ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
        style={{ left: pos.x, top: pos.y }}
      >
      {multiSelect ? (
        <>
          <p className="text-sm font-semibold">{selectedTokens.length} tokens selected</p>
          <button
            type="button"
            className="mt-2 min-h-9 w-full rounded-lg border border-slate-600 bg-slate-800/80 text-xs text-slate-300"
            onClick={() => setMultiPanelHidden(true)}
          >
            Hide
          </button>
          {isGm && (
            <GmPlayerTokenControls
              tokens={selectedTokens}
              onToggleVisible={(tokenIds) =>
                toggleVisibleToPlayersForTokens(activeSceneId, tokenIds)
              }
              onToggleLock={(tokenIds) =>
                toggleLockedForPlayersForTokens(activeSceneId, tokenIds)
              }
            />
          )}
        </>
      ) : (
        <>
          <InlineRenameField
            value={primaryToken!.name}
            canRename={canEditToken(primaryToken!)}
            nameClassName="text-sm"
            onRenamingChange={setRenamingTokenName}
            onRename={(name) => updateToken(activeSceneId!, primaryToken!.id, { name })}
          />
          {canEditToken(primaryToken!) && (
            <button
              type="button"
              className="mt-2 min-h-10 w-full rounded-lg border border-slate-600 bg-slate-800/80 text-sm text-slate-200 hover:bg-slate-700"
              onClick={() => startTokenScale()}
            >
              Resize
            </button>
          )}
          <p className="mt-2 text-xs text-slate-400">
            {primaryToken!.footprint.w}×{primaryToken!.footprint.h} cells
          </p>
          {isGm && (
            <GmPlayerTokenControls
              tokens={selectedTokens}
              onToggleVisible={(tokenIds) =>
                toggleVisibleToPlayersForTokens(activeSceneId, tokenIds)
              }
              onToggleLock={(tokenIds) =>
                toggleLockedForPlayersForTokens(activeSceneId, tokenIds)
              }
            />
          )}
        </>
      )}

      {!multiSelect &&
        primaryToken &&
        canEditToken(primaryToken) &&
        isCoarsePointer &&
        !movingToken && (
          <TranslateHandle
            token={primaryToken}
            stagePos={{ x: stageX, y: stageY }}
            scale={scale}
            menuOnLeft={sideLeftRef.current}
            onStart={() => {
              setInteractionMode('moving');
              setMovePreview({
                gridPos: primaryToken.gridPos,
                posOffset: primaryToken.posOffset,
              });
            }}
          />
        )}

      {showTransform && (
        <TransformControls
          tokens={editableTokens}
          onUpdate={(tokenId, patch) => updateToken(activeSceneId, tokenId, patch)}
        />
      )}

      {editableTokens.length > 0 && (
        <VitalityControls
          tokens={editableTokens}
          onToggleOne={(tokenId, state) =>
            toggleVitalityState(activeSceneId, tokenId, state)
          }
          onToggleMany={(tokenIds, state) =>
            applyVitalityForTokens(tokenIds, state)
          }
        />
      )}

      {editableTokens.length > 0 && (
        <StatusEffectControls
          tokens={editableTokens}
          onToggleOne={(tokenId, status) => toggleStatus(activeSceneId, tokenId, status)}
          onToggleMany={(tokenIds, status) => applyStatusForTokens(tokenIds, status)}
        />
      )}
      </div>
    </>
  );
}

function TranslateHandle({
  token,
  stagePos,
  scale,
  menuOnLeft,
  onStart,
}: {
  token: { gridPos: GridCell; footprint: { w: number; h: number } };
  stagePos: { x: number; y: number };
  scale: number;
  menuOnLeft: boolean;
  onStart: () => void;
}) {
  const c = getTokenScreenCenter(token as Token, stagePos, scale);
  const tokenWScreen = token.footprint.w * GRID_SIZE_PX * scale;
  const tokenHalfWScreen = tokenWScreen / 2;
  const size = 44;
  const pad = Math.max(10, 14 * scale);
  const side = menuOnLeft ? 1 : -1;
  const x = c.x + side * (tokenHalfWScreen + pad) - size / 2;
  const y = c.y - size / 2;

  return (
    <div
      className="pointer-events-auto absolute z-30"
      style={{ left: x, top: y, width: size, height: size }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onStart();
      }}
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onStart();
      }}
    >
      <div className="flex h-full w-full items-center justify-center rounded-full border border-white/60 bg-white/10 text-white backdrop-blur">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="opacity-90">
          <path
            d="M12 2l3 3h-2v4h-2V5H9l3-3zM12 22l-3-3h2v-4h2v4h2l-3 3zM2 12l3-3v2h4v2H5v2l-3-3zM22 12l-3 3v-2h-4v-2h4V9l3 3z"
            fill="currentColor"
          />
        </svg>
      </div>
    </div>
  );
}
