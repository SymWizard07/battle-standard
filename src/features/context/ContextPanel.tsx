import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
import {
  isStatExpressionHighlight,
  sanitizeStatExpression,
  STAT_EXPRESSION_TOKEN,
  tryEvaluateExpressionAt,
} from '../../lib/statExpression';
import { InlineRenameField } from '../../components/InlineRenameField';
import { TokenNameSyntaxHint } from '../../components/TokenNameSyntaxHint';
import {
  StyledTokenSheetText,
  TokenSheetTextSyntaxHint,
} from '../../components/StyledTokenSheetText';
import { TokenSheetTextEditor } from '../../components/TokenSheetTextEditor';
import {
  normalizeSkillSlots,
  parseTokenSheetClipboard,
  serializeTokenSheetClipboard,
} from '../../lib/tokenSheet';
import { FastTooltip } from './FastTooltip';
import type {
  GridCell,
  Point,
  StatusEffectId,
  Token,
  TokenGridPlacement,
  TokenSkill,
  TokenSkillType,
  TokenSpeed,
  TokenSpeedType,
  TokenVitalityState,
} from '../../lib/types';

function CopySheetIcon({ className }: { className?: string }) {
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
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function PasteSheetIcon({ className }: { className?: string }) {
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
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  );
}

/** Curved arrow forward (open sheet). */
function CurveForwardIcon({ className }: { className?: string }) {
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
      <path d="M15 15l6-6-6-6" />
      <path d="M21 9H9a6 6 0 0 0 0 12h3" />
    </svg>
  );
}

/** Curved arrow back (return to token). */
function CurveBackIcon({ className }: { className?: string }) {
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
      <path d="M9 15l-6-6 6-6" />
      <path d="M3 9h12a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}

const SHEET_ICON_BTN =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50';

function TokenSheetClipboardButtons({
  token,
  canEdit,
  onApply,
}: {
  token: Token;
  canEdit: boolean;
  onApply: (patch: Partial<Token> & { name?: string }) => void;
}) {
  const [copyFlash, setCopyFlash] = useState(false);
  const [pasteError, setPasteError] = useState(false);

  const copySheet = async () => {
    try {
      await navigator.clipboard.writeText(serializeTokenSheetClipboard(token));
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 1200);
    } catch {
      setPasteError(false);
    }
  };

  const pasteSheet = async () => {
    if (!canEdit) return;
    try {
      const raw = await navigator.clipboard.readText();
      const patch = parseTokenSheetClipboard(raw);
      if (!patch) {
        setPasteError(true);
        window.setTimeout(() => setPasteError(false), 1600);
        return;
      }
      setPasteError(false);
      onApply(patch);
    } catch {
      setPasteError(true);
      window.setTimeout(() => setPasteError(false), 1600);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        className={SHEET_ICON_BTN}
        onClick={() => void copySheet()}
        aria-label="Copy sheet as JSON"
        title={copyFlash ? 'Copied' : 'Copy sheet JSON'}
      >
        <CopySheetIcon className="h-4 w-4" />
      </button>
      {canEdit && (
        <button
          type="button"
          className={SHEET_ICON_BTN}
          onClick={() => void pasteSheet()}
          aria-label="Paste sheet from JSON"
          title={pasteError ? 'Invalid sheet JSON' : 'Paste sheet JSON'}
        >
          <PasteSheetIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

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

function clampStatDigits(raw: string, maxDigits: number): string {
  return raw.replace(/\D/g, '').slice(0, maxDigits);
}

/** Blue for additives / dice / *-place expressions; undefined keeps inherited cell color. */
function statExpressionStyle(value: string): CSSProperties | undefined {
  return isStatExpressionHighlight(value) ? { color: '#38bdf8' } : undefined;
}

function handleExpressionCtrlClick(
  e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>,
  value: string,
  onChange: (next: string) => void,
  options?: { preserveSignPrefix?: boolean },
) {
  if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return;
  const index = e.currentTarget.selectionStart ?? 0;
  const next = tryEvaluateExpressionAt(value, index, Math.random, options);
  if (next == null || next === value) return;
  e.preventDefault();
  onChange(next);
}

function renderTextWithStatExpressions(text: string, plainClassName = ''): ReactNode {
  if (!text) return null;
  const nodes: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(STAT_EXPRESSION_TOKEN.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) != null) {
    const [token] = match;
    if (!isStatExpressionHighlight(token)) continue;
    if (match.index > last) {
      nodes.push(
        <span key={`t-${last}`} className={plainClassName}>
          {text.slice(last, match.index)}
        </span>,
      );
    }
    nodes.push(
      <span key={`e-${match.index}`} style={{ color: '#38bdf8' }}>
        {token}
      </span>,
    );
    last = match.index + token.length;
  }
  if (last < text.length) {
    nodes.push(
      <span key={`t-${last}`} className={plainClassName}>
        {text.slice(last)}
      </span>,
    );
  }
  return nodes.length > 0 ? nodes : text;
}

const SPEED_TYPES: {
  type: TokenSpeedType;
  label: string;
  color: string;
}[] = [
  { type: 'walk', label: 'Walk', color: '#94a3b8' },
  { type: 'fly', label: 'Fly', color: '#38bdf8' },
  { type: 'swim', label: 'Swim', color: '#2dd4bf' },
  { type: 'climb', label: 'Climb', color: '#fbbf24' },
  { type: 'burrow', label: 'Burrow', color: '#d97706' },
];

const SKILL_TYPES: {
  type: TokenSkillType;
  label: string;
  color: string;
}[] = [
  { type: 'acrobatics', label: 'Acrobatics', color: '#4ade80' },
  { type: 'animalHandling', label: 'Animal Handling', color: '#86efac' },
  { type: 'arcana', label: 'Arcana', color: '#a78bfa' },
  { type: 'athletics', label: 'Athletics', color: '#f87171' },
  { type: 'deception', label: 'Deception', color: '#f472b6' },
  { type: 'history', label: 'History', color: '#818cf8' },
  { type: 'insight', label: 'Insight', color: '#2dd4bf' },
  { type: 'intimidation', label: 'Intimidation', color: '#fb7185' },
  { type: 'investigation', label: 'Investigation', color: '#60a5fa' },
  { type: 'medicine', label: 'Medicine', color: '#5eead4' },
  { type: 'nature', label: 'Nature', color: '#34d399' },
  { type: 'perception', label: 'Perception', color: '#22d3ee' },
  { type: 'performance', label: 'Performance', color: '#e879f9' },
  { type: 'persuasion', label: 'Persuasion', color: '#f9a8d4' },
  { type: 'religion', label: 'Religion', color: '#c4b5fd' },
  { type: 'sleightOfHand', label: 'Sleight of Hand', color: '#a3e635' },
  { type: 'stealth', label: 'Stealth', color: '#84cc16' },
  { type: 'survival', label: 'Survival', color: '#fbbf24' },
];

type SkillSlotType = TokenSkillType | null;

const STAT_CELL =
  'border border-slate-600 bg-slate-800 text-slate-100 outline-none focus:border-sky-500 focus:z-10';
const STAT_LABEL =
  'flex items-center justify-center border border-slate-600 bg-slate-900/90 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400';

/** Viewport-fixed dropdown geometry so menus escape transformed/overflow parents. */
function floatingMenuStyle(
  trigger: HTMLElement,
  preferredMaxHeight: number,
): CSSProperties {
  const r = trigger.getBoundingClientRect();
  const pad = 8;
  const spaceBelow = window.innerHeight - r.bottom - pad;
  const spaceAbove = r.top - pad;
  const needed = Math.min(preferredMaxHeight, 180);
  const openUp = spaceBelow < needed && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(96, Math.min(preferredMaxHeight, available));

  return {
    position: 'fixed',
    left: r.left,
    width: Math.max(r.width, 96),
    maxHeight,
    zIndex: 10000,
    ...(openUp
      ? { bottom: window.innerHeight - r.top, top: 'auto' }
      : { top: r.bottom, bottom: 'auto' }),
  };
}

const FLOATING_MENU_CLASS =
  'overflow-y-auto border border-slate-600 bg-slate-900 shadow-lg';

function cycleIndex(length: number, index: number, delta: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

/** Scroll-wheel cycles options while the menu is closed (non-passive so it can block page scroll). */
function useClosedDropdownWheel(
  enabled: boolean,
  menuOpen: boolean,
  elRef: { current: HTMLElement | null },
  onStep: (dir: 1 | -1) => void,
) {
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    if (!enabled || menuOpen) return;
    const el = elRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 && e.deltaX === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const primary =
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      onStepRef.current(primary > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled, menuOpen, elRef]);
}

const ABILITY_KEYS = [
  { key: 'str', modKey: 'strMod', saveKey: 'strSave', label: 'Str' },
  { key: 'int', modKey: 'intMod', saveKey: 'intSave', label: 'Int' },
  { key: 'dex', modKey: 'dexMod', saveKey: 'dexSave', label: 'Dex' },
  { key: 'wis', modKey: 'wisMod', saveKey: 'wisSave', label: 'Wis' },
  { key: 'con', modKey: 'conMod', saveKey: 'conSave', label: 'Con' },
  { key: 'cha', modKey: 'chaMod', saveKey: 'chaSave', label: 'Cha' },
] as const;

/** 5e alignments: moral axis green→blue→red; law/chaos shifts lightness. */
const ALIGNMENTS: {
  value: string;
  label: string;
  /** -1 good … 0 neutral … 1 evil (fractional for in-between gradients) */
  moral: number;
  /** -1 lawful … 0 neutral … 1 chaotic */
  order: number;
}[] = [
  { value: 'Lawful Good', label: 'Lawful Good', moral: -1, order: -1 },
  { value: 'Neutral Good', label: 'Neutral Good', moral: -0.7, order: 0 },
  { value: 'Chaotic Good', label: 'Chaotic Good', moral: -0.45, order: 1 },
  { value: 'Lawful Neutral', label: 'Lawful Neutral', moral: -0.2, order: -1 },
  { value: 'True Neutral', label: 'True Neutral', moral: 0, order: 0 },
  { value: 'Chaotic Neutral', label: 'Chaotic Neutral', moral: 0.2, order: 1 },
  { value: 'Lawful Evil', label: 'Lawful Evil', moral: 0.45, order: -1 },
  { value: 'Neutral Evil', label: 'Neutral Evil', moral: 0.7, order: 0 },
  { value: 'Chaotic Evil', label: 'Chaotic Evil', moral: 1, order: 1 },
  { value: 'Unaligned', label: 'Unaligned', moral: 0, order: 0 },
];

const ALIGNMENT_CYCLE = ['', ...ALIGNMENTS.map((a) => a.value)];

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function alignmentColor(moral: number, order: number, value?: string): string {
  if (value === 'Unaligned' || value === '') return '#94a3b8';
  // Good #4ade80 → Neutral #60a5fa → Evil #f87171
  const good = { r: 74, g: 222, b: 128 };
  const neutral = { r: 96, g: 165, b: 250 };
  const evil = { r: 248, g: 113, b: 113 };
  const t = (moral + 1) / 2; // 0..1
  let r: number;
  let g: number;
  let b: number;
  if (t <= 0.5) {
    const u = t * 2;
    r = lerpChannel(good.r, neutral.r, u);
    g = lerpChannel(good.g, neutral.g, u);
    b = lerpChannel(good.b, neutral.b, u);
  } else {
    const u = (t - 0.5) * 2;
    r = lerpChannel(neutral.r, evil.r, u);
    g = lerpChannel(neutral.g, evil.g, u);
    b = lerpChannel(neutral.b, evil.b, u);
  }
  // Lawful slightly deeper; chaotic slightly brighter (in-between gradients).
  const lift = 1 + order * 0.1;
  r = Math.min(255, Math.max(0, Math.round(r * lift)));
  g = Math.min(255, Math.max(0, Math.round(g * lift)));
  b = Math.min(255, Math.max(0, Math.round(b * lift)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function alignmentMeta(value: string) {
  const found = ALIGNMENTS.find(
    (a) => a.value.toLowerCase() === value.trim().toLowerCase(),
  );
  if (found) {
    return {
      ...found,
      color: alignmentColor(found.moral, found.order, found.value),
    };
  }
  if (!value.trim()) {
    return { value: '', label: '—', moral: 0, order: 0, color: '#94a3b8' };
  }
  return { value, label: value, moral: 0, order: 0, color: '#e2e8f0' };
}

function TokenAlignmentField({
  value,
  canEdit,
  onChange,
}: {
  value: string;
  canEdit: boolean;
  onChange: (alignment: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const meta = alignmentMeta(value);

  useClosedDropdownWheel(canEdit, menuOpen, rootRef, (dir) => {
    const cur = value.trim().toLowerCase();
    let idx = ALIGNMENT_CYCLE.findIndex((v) => v.toLowerCase() === cur);
    if (idx < 0) idx = 0;
    onChange(ALIGNMENT_CYCLE[cycleIndex(ALIGNMENT_CYCLE.length, idx, dir)]!);
  });

  useLayoutEffect(() => {
    if (!menuOpen || !rootRef.current) return;
    const update = () => {
      if (!rootRef.current) return;
      setMenuStyle(floatingMenuStyle(rootRef.current, 280));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  if (!canEdit) {
    return (
      <div className="flex min-w-0 flex-[2]">
        <span className={`${STAT_LABEL} h-7 w-9 shrink-0`}>Align</span>
        <span
          className={`${STAT_CELL} flex h-7 min-w-0 flex-1 items-center truncate px-1.5 text-xs font-medium`}
          style={{ color: meta.color }}
          title={meta.label}
        >
          {meta.label}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-[2]">
      <span className={`${STAT_LABEL} h-7 w-9 shrink-0`}>Align</span>
      <div ref={rootRef} className="relative min-w-0 flex-1">
        <button
          type="button"
          aria-label="Choose alignment"
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          onClick={() => setMenuOpen((o) => !o)}
          className={`${STAT_CELL} flex h-7 w-full min-w-0 items-center justify-between gap-1 px-1.5 text-left text-xs font-medium hover:bg-slate-700`}
        >
          <span className="min-w-0 truncate" style={{ color: meta.color }} title={meta.label}>
            {meta.label}
          </span>
          <span className="shrink-0 text-[10px] text-slate-400">▾</span>
        </button>
        {menuOpen &&
          createPortal(
            <ul
              ref={menuRef}
              role="listbox"
              aria-label="Alignments"
              className={FLOATING_MENU_CLASS}
              style={menuStyle}
            >
              <li role="option" aria-selected={!value.trim()}>
                <button
                  type="button"
                  className={`flex w-full px-1.5 py-1 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-800 ${
                    !value.trim() ? 'bg-slate-800/80' : ''
                  }`}
                  onClick={() => {
                    onChange('');
                    setMenuOpen(false);
                  }}
                >
                  None
                </button>
              </li>
              {ALIGNMENTS.map((opt) => {
                const color = alignmentColor(opt.moral, opt.order, opt.value);
                const selected =
                  value.trim().toLowerCase() === opt.value.toLowerCase();
                return (
                  <li key={opt.value} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={`flex w-full px-1.5 py-1 text-left text-[11px] font-medium hover:bg-slate-800 ${
                        selected ? 'bg-slate-800/80' : ''
                      }`}
                      style={{ color }}
                      onClick={() => {
                        onChange(opt.value);
                        setMenuOpen(false);
                      }}
                    >
                      {opt.label}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )}
      </div>
    </div>
  );
}

function speedTypeMeta(type: TokenSpeedType) {
  return SPEED_TYPES.find((s) => s.type === type) ?? SPEED_TYPES[0]!;
}

function skillTypeMeta(type: TokenSkillType) {
  return SKILL_TYPES.find((s) => s.type === type) ?? SKILL_TYPES[0]!;
}

function speedValueForType(speeds: TokenSpeed[] | undefined, type: TokenSpeedType): string {
  return speeds?.find((s) => s.type === type)?.value ?? '';
}

function skillValueForType(skills: TokenSkill[] | undefined, type: TokenSkillType): string {
  return skills?.find((s) => s.type === type)?.value ?? '';
}

function upsertSpeedValue(
  speeds: TokenSpeed[] | undefined,
  type: TokenSpeedType,
  value: string,
): TokenSpeed[] {
  const next = (speeds ?? []).filter((s) => s.type !== type);
  if (value.trim() === '') return next;
  return [...next, { type, value }];
}

function upsertSkillValue(
  skills: TokenSkill[] | undefined,
  type: TokenSkillType,
  value: string,
): TokenSkill[] {
  const next = (skills ?? []).filter((s) => s.type !== type);
  if (value.trim() === '') return next;
  return [...next, { type, value }];
}

function TokenStatCell({
  label,
  value,
  maxLength,
  canEdit,
  onChange,
  inputMode = 'numeric',
  digitsOnly = true,
  expression = false,
  className = '',
  wide,
  labelWidth = 'w-9',
}: {
  label: string;
  value: string;
  maxLength?: number;
  canEdit: boolean;
  onChange: (value: string) => void;
  inputMode?: 'numeric' | 'text';
  digitsOnly?: boolean;
  /** Restrict input to digits / d / +/− (still highlights expressions in any mode). */
  expression?: boolean;
  className?: string;
  wide?: boolean;
  labelWidth?: string;
}) {
  const freeText = !digitsOnly && !expression;
  const expressionStyle = !freeText ? statExpressionStyle(value) : undefined;
  return (
    <div className={`flex min-w-0 ${wide ? 'flex-[2]' : 'flex-1'} ${className}`}>
      <span className={`${STAT_LABEL} h-7 shrink-0 ${wide ? 'w-12' : labelWidth}`}>{label}</span>
      {canEdit ? (
        freeText ? (
          <div className={`${STAT_CELL} relative h-7 min-w-0 flex-1`}>
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre px-1.5 text-xs leading-7"
              aria-hidden
            >
              {value ? (
                renderTextWithStatExpressions(value)
              ) : (
                <span className="text-transparent">.</span>
              )}
            </div>
            <input
              type="text"
              inputMode="text"
              maxLength={maxLength}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onClick={(e) => handleExpressionCtrlClick(e, value, onChange)}
              title="Ctrl+click an expression to evaluate"
              className="relative h-full w-full min-w-0 bg-transparent px-1.5 text-xs text-transparent caret-sky-300 outline-none"
              aria-label={label}
            />
          </div>
        ) : (
          <input
            type="text"
            inputMode={expression || !digitsOnly ? 'text' : inputMode}
            maxLength={maxLength}
            value={value}
            onChange={(e) => {
              const raw = e.target.value;
              if (expression) {
                onChange(sanitizeStatExpression(raw).slice(0, maxLength ?? 24));
              } else if (digitsOnly && maxLength != null) {
                onChange(clampStatDigits(raw, maxLength));
              } else {
                onChange(raw);
              }
            }}
            onClick={(e) => handleExpressionCtrlClick(e, value, onChange)}
            title="Ctrl+click an expression to evaluate"
            style={expressionStyle}
            className={`${STAT_CELL} h-7 min-w-0 flex-1 px-1.5 text-xs`}
            aria-label={label}
          />
        )
      ) : (
        <span
          style={!freeText && value.trim() ? expressionStyle : undefined}
          className={`${STAT_CELL} flex h-7 min-w-0 flex-1 items-center overflow-hidden px-1.5 text-xs ${
            value.trim() ? '' : 'text-slate-300'
          }`}
        >
          {value.trim()
            ? freeText
              ? renderTextWithStatExpressions(value)
              : value
            : '—'}
        </span>
      )}
    </div>
  );
}

function AbilityStatField({
  label,
  value,
  canEdit,
  onChange,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col">
      <span className={`${STAT_LABEL} h-5 w-full`}>{label}</span>
      {canEdit ? (
        <input
          type="text"
          inputMode="text"
          maxLength={16}
          value={value}
          onChange={(e) => onChange(sanitizeStatExpression(e.target.value).slice(0, 16))}
          onClick={(e) => handleExpressionCtrlClick(e, value, onChange)}
          title="Ctrl+click an expression to evaluate"
          style={statExpressionStyle(value)}
          className={`${STAT_CELL} h-7 w-full px-0.5 text-center text-xs font-semibold`}
          aria-label={label}
        />
      ) : (
        <span
          style={value.trim() ? statExpressionStyle(value) : undefined}
          className={`${STAT_CELL} flex h-7 w-full items-center justify-center text-xs font-semibold ${
            value.trim() ? '' : 'text-slate-300'
          }`}
        >
          {value.trim() ? value : '—'}
        </span>
      )}
    </label>
  );
}

function AbilitySubRow({
  label,
  values,
  canEdit,
  onChangeAt,
}: {
  label: string;
  values: string[];
  canEdit: boolean;
  onChangeAt: (index: number, value: string) => void;
}) {
  return (
    <div className="flex min-w-0 gap-px">
      <span className={`${STAT_LABEL} h-7 w-9 shrink-0`}>{label}</span>
      {values.map((value, index) =>
        canEdit ? (
          <input
            key={index}
            type="text"
            inputMode="text"
            maxLength={16}
            value={value}
            onChange={(e) =>
              onChangeAt(index, sanitizeStatExpression(e.target.value).slice(0, 16))
            }
            onClick={(e) =>
              handleExpressionCtrlClick(e, value, (next) => onChangeAt(index, next), {
                preserveSignPrefix: true,
              })
            }
            title="Ctrl+click an expression to evaluate"
            style={statExpressionStyle(value)}
            className={`${STAT_CELL} h-7 min-w-0 flex-1 px-0.5 text-center text-xs`}
            aria-label={`${label} ${ABILITY_KEYS[index]!.label}`}
          />
        ) : (
          <span
            key={index}
            style={value.trim() ? statExpressionStyle(value) : undefined}
            className={`${STAT_CELL} flex h-7 min-w-0 flex-1 items-center justify-center text-xs ${
              value.trim() ? '' : 'text-slate-300'
            }`}
          >
            {value.trim() ? value : '—'}
          </span>
        ),
      )}
    </div>
  );
}

function TokenSpeedField({
  speeds,
  canEdit,
  onChange,
}: {
  speeds: TokenSpeed[];
  canEdit: boolean;
  onChange: (speeds: TokenSpeed[]) => void;
}) {
  const [activeType, setActiveType] = useState<TokenSpeedType>('walk');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const meta = speedTypeMeta(activeType);
  const value = speedValueForType(speeds, activeType);

  useClosedDropdownWheel(canEdit, menuOpen, rootRef, (dir) => {
    const idx = SPEED_TYPES.findIndex((s) => s.type === activeType);
    const next = SPEED_TYPES[cycleIndex(SPEED_TYPES.length, Math.max(0, idx), dir)]!;
    setActiveType(next.type);
  });

  useLayoutEffect(() => {
    if (!menuOpen || !rootRef.current) return;
    const update = () => {
      if (!rootRef.current) return;
      setMenuStyle(floatingMenuStyle(rootRef.current, 160));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-w-0 flex-1">
      <span className={`${STAT_LABEL} h-7 w-12 shrink-0`}>Speed</span>
      {!canEdit ? (
        <span className={`${STAT_CELL} flex h-7 min-w-0 flex-1 items-center justify-between gap-1 px-1 text-[10px]`}>
          <span className="min-w-0 truncate font-medium" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <span
            className={`shrink-0 ${value.trim() ? '' : 'text-slate-300'}`}
            style={value.trim() ? statExpressionStyle(value) : undefined}
          >
            {value.trim() ? value : '—'}
          </span>
        </span>
      ) : (
        <div ref={rootRef} className="relative min-w-0 flex-1">
          <div className={`${STAT_CELL} flex h-7 min-w-0 items-stretch`}>
            <span
              className="flex max-w-[55%] items-center truncate px-1 text-[10px] font-medium"
              style={{ color: meta.color }}
              title={meta.label}
            >
              {meta.label}
            </span>
            <input
              type="text"
              inputMode="text"
              maxLength={16}
              value={value}
              placeholder="ft"
              aria-label={`${meta.label} speed`}
              onChange={(e) =>
                onChange(
                  upsertSpeedValue(speeds, activeType, sanitizeStatExpression(e.target.value).slice(0, 16)),
                )
              }
              onClick={(e) =>
                handleExpressionCtrlClick(e, value, (next) =>
                  onChange(upsertSpeedValue(speeds, activeType, next)),
                )
              }
              title="Ctrl+click an expression to evaluate"
              style={statExpressionStyle(value)}
              className="min-w-0 flex-1 bg-transparent px-0.5 text-center text-xs text-slate-100 outline-none"
            />
            <button
              type="button"
              aria-label={`Choose ${meta.label} speed type`}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex w-5 shrink-0 items-center justify-center border-l border-slate-600 text-[10px] text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            >
              ▾
            </button>
          </div>
          {menuOpen &&
            createPortal(
              <ul
                ref={menuRef}
                role="listbox"
                aria-label="Speed types"
                className={FLOATING_MENU_CLASS}
                style={menuStyle}
              >
                {SPEED_TYPES.map((opt) => (
                  <li key={opt.type} role="option" aria-selected={opt.type === activeType}>
                    <button
                      type="button"
                      className={`flex w-full px-1.5 py-1 text-left text-[11px] font-medium hover:bg-slate-800 ${
                        opt.type === activeType ? 'bg-slate-800/80' : ''
                      }`}
                      style={{ color: opt.color }}
                      onClick={() => {
                        setActiveType(opt.type);
                        setMenuOpen(false);
                      }}
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
              </ul>,
              document.body,
            )}
        </div>
      )}
    </div>
  );
}

function TokenSkillField({
  skills,
  activeType,
  onActiveTypeChange,
  canEdit,
  onChange,
}: {
  skills: TokenSkill[];
  activeType: SkillSlotType;
  onActiveTypeChange: (type: SkillSlotType) => void;
  canEdit: boolean;
  onChange: (skills: TokenSkill[]) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const isNone = activeType == null;
  const meta = isNone ? null : skillTypeMeta(activeType);
  const value = isNone ? '' : skillValueForType(skills, activeType);
  const label = isNone ? 'None' : meta!.label;
  const labelColor = isNone ? undefined : meta!.color;

  useClosedDropdownWheel(canEdit, menuOpen, rootRef, (dir) => {
    const cycle: SkillSlotType[] = [null, ...SKILL_TYPES.map((s) => s.type)];
    let idx = cycle.findIndex((t) => t === activeType);
    if (idx < 0) idx = 0;
    onActiveTypeChange(cycle[cycleIndex(cycle.length, idx, dir)]!);
  });

  useLayoutEffect(() => {
    if (!menuOpen || !rootRef.current) return;
    const update = () => {
      if (!rootRef.current) return;
      setMenuStyle(floatingMenuStyle(rootRef.current, 256));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  if (!canEdit) {
    return (
      <span className={`${STAT_CELL} flex h-7 min-w-0 flex-1 items-center justify-between gap-1 px-1 text-[10px]`}>
        <span
          className={`min-w-0 truncate font-medium ${isNone ? 'text-slate-500' : ''}`}
          style={labelColor ? { color: labelColor } : undefined}
        >
          {label}
        </span>
        <span
          className={`shrink-0 ${value.trim() ? '' : 'text-slate-500'}`}
          style={value.trim() ? statExpressionStyle(value) : undefined}
        >
          {value.trim() ? value : '—'}
        </span>
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <div className={`${STAT_CELL} flex h-7 min-w-0 items-stretch`}>
        <span
          className={`flex max-w-[55%] items-center truncate px-1 text-[10px] font-medium ${
            isNone ? 'text-slate-500' : ''
          }`}
          style={labelColor ? { color: labelColor } : undefined}
          title={label}
        >
          {label}
        </span>
        {isNone ? (
          <span
            className="flex min-w-0 flex-1 items-center justify-center px-0.5 text-xs text-slate-500"
            aria-label="No skill selected"
          >
            —
          </span>
        ) : (
          <input
            type="text"
            inputMode="text"
            maxLength={16}
            value={value}
            placeholder="+0"
            aria-label={`${label} bonus`}
            onChange={(e) =>
              onChange(
                upsertSkillValue(skills, activeType, sanitizeStatExpression(e.target.value).slice(0, 16)),
              )
            }
            onClick={(e) =>
              handleExpressionCtrlClick(e, value, (next) =>
                onChange(upsertSkillValue(skills, activeType, next)),
              )
            }
            title="Ctrl+click an expression to evaluate"
            style={statExpressionStyle(value)}
            className="min-w-0 flex-1 bg-transparent px-0.5 text-center text-xs text-slate-100 outline-none"
          />
        )}
        <button
          type="button"
          aria-label={isNone ? 'Choose skill' : `Choose ${label} skill`}
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex w-5 shrink-0 items-center justify-center border-l border-slate-600 text-[10px] text-slate-400 hover:bg-slate-700 hover:text-slate-200"
        >
          ▾
        </button>
      </div>
      {menuOpen &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            aria-label="Skills"
            className={FLOATING_MENU_CLASS}
            style={menuStyle}
          >
            <li role="option" aria-selected={isNone}>
              <button
                type="button"
                className={`flex w-full px-1.5 py-1 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-800 ${
                  isNone ? 'bg-slate-800/80' : ''
                }`}
                onClick={() => {
                  onActiveTypeChange(null);
                  setMenuOpen(false);
                }}
              >
                None
              </button>
            </li>
            {SKILL_TYPES.map((opt) => (
              <li key={opt.type} role="option" aria-selected={opt.type === activeType}>
                <button
                  type="button"
                  className={`flex w-full px-1.5 py-1 text-left text-[11px] font-medium hover:bg-slate-800 ${
                    opt.type === activeType ? 'bg-slate-800/80' : ''
                  }`}
                  style={{ color: opt.color }}
                  onClick={() => {
                    onActiveTypeChange(opt.type);
                    setMenuOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}

function ActionsExpressionEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col gap-1">
      <div className={`${STAT_CELL} flex min-h-0 min-w-0 w-full flex-1 flex-col`}>
        <TokenSheetTextEditor
          value={value}
          onChange={onChange}
          className="px-1.5 py-1"
        />
      </div>
      <TokenSheetTextSyntaxHint className="shrink-0 px-0.5" />
    </div>
  );
}

function TokenStatsEditor({
  token,
  canEdit,
  onPatch,
}: {
  token: Token;
  canEdit: boolean;
  onPatch: (patch: Partial<Token>) => void;
}) {
  const skillSlots = normalizeSkillSlots(token.skillSlots);
  const sheetSection = token.sheetSection === 'actions' ? 'actions' : 'attributes';
  const showAttributes = sheetSection === 'attributes';

  const toggleSheetSection = () => {
    onPatch({ sheetSection: showAttributes ? 'actions' : 'attributes' });
  };

  return (
    <div className="mt-1.5 flex min-w-0 flex-col gap-px">
      <div className="flex min-w-0 gap-px">
        <div className="flex min-w-0 flex-[0.9] flex-col gap-px">
          <TokenStatCell
            label="AC"
            value={token.ac ?? ''}
            maxLength={16}
            canEdit={canEdit}
            expression
            onChange={(ac) => onPatch({ ac })}
          />
          <TokenStatCell
            label="HP"
            value={token.hp ?? ''}
            maxLength={16}
            canEdit={canEdit}
            expression
            onChange={(hp) => onPatch({ hp })}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <TokenStatCell
            label="Init"
            value={token.initiative ?? ''}
            maxLength={16}
            canEdit={canEdit}
            expression
            onChange={(initiative) => onPatch({ initiative })}
          />
          <TokenSpeedField
            speeds={token.speeds ?? []}
            canEdit={canEdit}
            onChange={(speeds) => onPatch({ speeds })}
          />
        </div>
      </div>

      <button
        type="button"
        className={`${STAT_LABEL} h-6 w-full min-w-0 cursor-pointer gap-1 hover:bg-slate-800 hover:text-slate-200`}
        aria-pressed={!showAttributes}
        title={
          showAttributes
            ? 'Show Traits (actions, reactions, effects)'
            : 'Show Attributes'
        }
        onClick={toggleSheetSection}
      >
        <span className="text-[9px] opacity-70" aria-hidden>
          ⇄
        </span>
        {showAttributes ? 'Attributes' : 'Traits'}
      </button>

      <div
        className={`relative min-w-0 w-full ${
          showAttributes ? 'overflow-visible' : 'overflow-hidden'
        }`}
      >        <div
          className="flex min-w-0 flex-col gap-px"
          aria-hidden={!showAttributes}
          style={{
            visibility: showAttributes ? 'visible' : 'hidden',
            pointerEvents: showAttributes ? 'auto' : 'none',
          }}
        >
          <div className="flex min-w-0 gap-px">
            <div className="flex w-9 shrink-0 flex-col">
              <span className="h-5" aria-hidden />
              <span className={`${STAT_LABEL} h-7 w-full`} aria-hidden />
            </div>
            {ABILITY_KEYS.map(({ key, label }) => (
              <AbilityStatField
                key={key}
                label={label}
                value={token[key] ?? ''}
                canEdit={canEdit}
                onChange={(v) => onPatch({ [key]: v })}
              />
            ))}
          </div>

          <AbilitySubRow
            label="Mod"
            values={ABILITY_KEYS.map(({ modKey }) => token[modKey] ?? '')}
            canEdit={canEdit}
            onChangeAt={(index, value) => onPatch({ [ABILITY_KEYS[index]!.modKey]: value })}
          />
          <AbilitySubRow
            label="Save"
            values={ABILITY_KEYS.map(({ saveKey }) => token[saveKey] ?? '')}
            canEdit={canEdit}
            onChangeAt={(index, value) => onPatch({ [ABILITY_KEYS[index]!.saveKey]: value })}
          />

          <div className="flex min-w-0 gap-px">
            {skillSlots.map((activeType, index) => (
              <TokenSkillField
                key={index}
                skills={token.skills ?? []}
                activeType={activeType}
                onActiveTypeChange={(type) => {
                  const next = skillSlots.map((t, i) => (i === index ? type : t));
                  onPatch({ skillSlots: next });
                }}
                canEdit={canEdit}
                onChange={(skills) => onPatch({ skills })}
              />
            ))}
          </div>

          <div className="flex min-w-0 gap-px">
            <TokenAlignmentField
              value={token.alignment ?? ''}
              canEdit={canEdit}
              onChange={(alignment) => onPatch({ alignment })}
            />
            <TokenStatCell
              label="PP"
              value={token.passivePerception ?? ''}
              maxLength={16}
              canEdit={canEdit}
              expression
              labelWidth="w-8"
              onChange={(passivePerception) => onPatch({ passivePerception })}
              className="max-w-[4.5rem] shrink"
            />
            <TokenStatCell
              label="XP"
              value={token.xp ?? ''}
              maxLength={16}
              canEdit={canEdit}
              expression
              onChange={(xp) => onPatch({ xp })}
              className="max-w-[7rem] shrink"
            />
          </div>

          <TokenStatCell
            label="Senses"
            value={token.senses ?? ''}
            canEdit={canEdit}
            inputMode="text"
            digitsOnly={false}
            wide
            labelWidth="w-12"
            onChange={(senses) => onPatch({ senses })}
          />

          <TokenStatCell
            label="Lang"
            value={token.languages ?? ''}
            canEdit={canEdit}
            inputMode="text"
            digitsOnly={false}
            wide
            onChange={(languages) => onPatch({ languages })}
          />
        </div>

        {!showAttributes && (
          <div className="absolute inset-0 flex min-h-0 min-w-0 flex-col">
            {canEdit ? (
              <ActionsExpressionEditor
                value={token.actions ?? ''}
                onChange={(actions) => onPatch({ actions })}
              />
            ) : (
              <div
                className={`${STAT_CELL} h-full min-h-0 min-w-0 w-full flex-1 overflow-auto whitespace-pre-wrap break-words px-1.5 py-1 text-xs leading-snug ${
                  (token.actions ?? '').trim() ? '' : 'text-slate-300'
                }`}
              >
                {(token.actions ?? '').trim() ? (
                  <StyledTokenSheetText value={token.actions ?? ''} />
                ) : (
                  '—'
                )}
              </div>
            )}
          </div>
        )}
      </div>
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
  const [statsMode, setStatsMode] = useState(false);
  const showSheet = statsMode && !asPlayer;
  const [flipAngle, setFlipAngle] = useState(0);
  const [flipTransition, setFlipTransition] = useState(true);
  const [flipBusy, setFlipBusy] = useState(false);
  const [panelHovered, setPanelHovered] = useState(false);
  const [panelFocused, setPanelFocused] = useState(false);
  const hoveredTokenId = useStore((s) => s.hoveredTokenId);
  const flipGenRef = useRef(0);
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
    flipGenRef.current += 1;
    setMultiPanelHidden(false);
    setRenamingTokenName(false);
    setStatsMode(false);
    setFlipAngle(0);
    setFlipTransition(true);
    setFlipBusy(false);
    setPanelHovered(false);
    setPanelFocused(false);
  }, [selectedTokenIds.join(',')]);

  useEffect(() => {
    if (!asPlayer) return;
    setStatsMode(false);
    setFlipAngle(0);
    setFlipBusy(false);
  }, [asPlayer]);

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

    const panelW = showSheet ? 416 : 224;
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
    statsMode,
    asPlayer,
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
    // Leave room for the hanging Sheet/Token tab (~half button height).
    const bottomPad = multiSelect ? pad : pad + 14;
    if (bottom > pr.height - bottomPad) ny -= bottom - (pr.height - bottomPad);

    nx = Math.round(nx);
    ny = Math.round(ny);
    if (nx !== pos.x || ny !== pos.y) {
      setPos({ x: nx, y: ny });
    }
  }, [pos.x, pos.y, selectedTokens.length, measurement, statsMode, asPlayer, multiSelect]);

  const panelOpaque = panelHovered || panelFocused || hoveredTokenId != null;
  const panelOpacityClass = panelOpaque ? 'opacity-100' : 'opacity-60';
  const onPanelFocusCapture = () => setPanelFocused(true);
  const onPanelBlurCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setPanelFocused(false);
    }
  };

  if (!selectedTokens.length && !measurement) return null;

  if (measurement && activeSceneId) {
    return (
      <div
        ref={panelRef}
        className={`pointer-events-auto absolute z-20 w-52 rounded-xl border border-slate-600 bg-slate-900/95 p-3 shadow-xl transition-opacity duration-150 ${panelOpacityClass}`}
        style={{ left: pos.x, top: pos.y }}
        onPointerEnter={() => setPanelHovered(true)}
        onPointerLeave={() => setPanelHovered(false)}
        onFocusCapture={onPanelFocusCapture}
        onBlurCapture={onPanelBlurCapture}
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

  const STATS_PANEL_W = 416; // w-[26rem]
  const NORMAL_PANEL_W = 224; // w-56
  const FLIP_HALF_MS = 130;
  const hintWidth = 168;
  const hintGap = 8;
  const hintLeft = sideLeftRef.current
    ? Math.max(8, pos.x - hintWidth - hintGap)
    : pos.x + (showSheet ? STATS_PANEL_W : NORMAL_PANEL_W) + hintGap;

  const flipToStats = (next: boolean) => {
    if (asPlayer || flipBusy || next === statsMode) return;
    const gen = ++flipGenRef.current;
    // Forward (to stats): +90 → swap → -90 → 0
    // Back (to status):   -90 → swap → +90 → 0
    const edgeOut = next ? 90 : -90;
    const edgeIn = next ? -90 : 90;
    setFlipBusy(true);
    setFlipTransition(true);
    setFlipAngle(edgeOut);
    window.setTimeout(() => {
      if (flipGenRef.current !== gen) return;
      setStatsMode(next);
      setFlipTransition(false);
      setFlipAngle(edgeIn);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (flipGenRef.current !== gen) return;
          setFlipTransition(true);
          setFlipAngle(0);
          window.setTimeout(() => {
            if (flipGenRef.current !== gen) return;
            setFlipBusy(false);
          }, FLIP_HALF_MS);
        });
      });
    }, FLIP_HALF_MS);
  };

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
      {!showSheet &&
        !multiSelect &&
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

      {multiSelect ? (
        <div
          ref={panelRef}
          className={`absolute z-20 w-56 rounded-xl border border-slate-600 bg-slate-900/95 shadow-xl transition-opacity duration-150 ${panelOpacityClass} ${
            movingToken ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
          style={{ left: pos.x, top: pos.y }}
          onPointerEnter={() => setPanelHovered(true)}
          onPointerLeave={() => setPanelHovered(false)}
          onFocusCapture={onPanelFocusCapture}
          onBlurCapture={onPanelBlurCapture}
        >
          <div className="max-h-[50vh] overflow-y-auto p-3 pb-5">
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
        </div>
      ) : primaryToken ? (
        <div
          ref={panelRef}
          className={`absolute z-20 min-w-0 transition-opacity duration-150 ${
            panelOpaque && !movingToken ? 'opacity-100' : 'opacity-60'
          } ${movingToken ? 'pointer-events-none' : 'pointer-events-auto'}`}
          style={{
            left: pos.x,
            top: pos.y,
            width: showSheet ? STATS_PANEL_W : NORMAL_PANEL_W,
            perspective: 1200,
          }}
          onPointerEnter={() => setPanelHovered(true)}
          onPointerLeave={() => setPanelHovered(false)}
          onFocusCapture={onPanelFocusCapture}
          onBlurCapture={onPanelBlurCapture}
        >
          <div
            className={`relative w-full min-w-0 overflow-visible border border-slate-600 bg-slate-900/95 shadow-xl ${
              showSheet ? 'rounded-sm' : 'rounded-xl'
            }`}
            style={{
              transform: `rotate3d(1, 1, 0, ${flipAngle}deg)`,
              transition: flipTransition
                ? `transform ${FLIP_HALF_MS}ms cubic-bezier(0.4, 0.1, 0.2, 1)`
                : 'none',
              transformOrigin: 'center center',
              willChange: 'transform',
            }}
          >
            {showSheet ? (
              <>
                <div className="min-w-0 overflow-visible p-2 pb-5">
                  <div className="flex min-w-0 items-center gap-1">
                    <InlineRenameField
                      value={primaryToken.name}
                      canRename={canEditToken(primaryToken)}
                      nameClassName="text-sm"
                      className="min-w-0 flex-1"
                      onRenamingChange={setRenamingTokenName}
                      onRename={(name) =>
                        updateToken(activeSceneId!, primaryToken.id, { name })
                      }
                    />
                    <TokenSheetClipboardButtons
                      token={primaryToken}
                      canEdit={canEditToken(primaryToken)}
                      onApply={(patch) =>
                        updateToken(activeSceneId!, primaryToken.id, patch)
                      }
                    />
                  </div>
                  <TokenStatsEditor
                    token={primaryToken}
                    canEdit={canEditToken(primaryToken)}
                    onPatch={(patch) =>
                      updateToken(activeSceneId!, primaryToken.id, patch)
                    }
                  />
                </div>
                {!movingToken && (
                  <button
                    type="button"
                    title="Back to token controls"
                    disabled={flipBusy}
                    onClick={() => flipToStats(false)}
                    className="absolute bottom-0 left-3 z-10 flex translate-y-1/2 items-center gap-1 rounded-full border border-slate-500 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-100 shadow-md transition-colors hover:border-slate-400 hover:bg-slate-700 disabled:opacity-60"
                  >
                    <CurveBackIcon className="h-3.5 w-3.5 shrink-0" />
                    Token
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="max-h-[50vh] overflow-y-auto p-3 pb-5">
                  <InlineRenameField
                    value={primaryToken.name}
                    canRename={canEditToken(primaryToken)}
                    nameClassName="text-sm"
                    onRenamingChange={setRenamingTokenName}
                    onRename={(name) =>
                      updateToken(activeSceneId!, primaryToken.id, { name })
                    }
                  />
                  {canEditToken(primaryToken) && (
                    <button
                      type="button"
                      className="mt-2 min-h-10 w-full rounded-lg border border-slate-600 bg-slate-800/80 text-sm text-slate-200 hover:bg-slate-700"
                      onClick={() => startTokenScale()}
                    >
                      Resize
                    </button>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {primaryToken.footprint.w}×{primaryToken.footprint.h} cells
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
                  {showTransform && (
                    <TransformControls
                      tokens={editableTokens}
                      onUpdate={(tokenId, patch) =>
                        updateToken(activeSceneId, tokenId, patch)
                      }
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
                      onToggleOne={(tokenId, status) =>
                        toggleStatus(activeSceneId, tokenId, status)
                      }
                      onToggleMany={(tokenIds, status) =>
                        applyStatusForTokens(tokenIds, status)
                      }
                    />
                  )}
                </div>
                {!movingToken && !asPlayer && (
                  <button
                    type="button"
                    title="Open character sheet"
                    disabled={flipBusy}
                    onClick={() => flipToStats(true)}
                    className="absolute bottom-0 right-3 z-10 flex translate-y-1/2 items-center gap-1 rounded-full border border-slate-500 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-100 shadow-md transition-colors hover:border-slate-400 hover:bg-slate-700 disabled:opacity-60"
                  >
                    Sheet
                    <CurveForwardIcon className="h-3.5 w-3.5 shrink-0" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
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
