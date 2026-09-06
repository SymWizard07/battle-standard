import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { StyledTokenName } from '../../components/StyledTokenName';
import { TokenNameSyntaxHint } from '../../components/TokenNameSyntaxHint';
import { plainTokenName } from '../../lib/tokenNameMarkup';
import { newId } from '../../lib/ids';
import { confirmAction } from '../confirm/confirmDialogStore';
import { evaluateStatExpression } from '../../lib/statExpression';
import { seesAsPlayer, useActiveScene, useStore } from '../../store/useStore';
import type { Token } from '../../lib/types';
import {
  ToolOptionButton,
  ToolOptionPanelRow,
  ToolOptionToggle,
} from '../toolbar/ToolOptionLayout';
import {
  DiceIcon,
  EyedropperIcon,
  GripDotsIcon,
  HeartIcon,
  RenameIcon,
  ResetIcon,
  ShieldIcon,
  SortDescendingIcon,
  TrashIcon,
  VisibilityIcon,
} from './InitiativeIcons';

export type InitiativeFieldKey = 'initiative' | 'name' | 'ac' | 'hp';

export type InitiativeFieldVisibility = Record<InitiativeFieldKey, boolean>;

export type InitiativeEntry = {
  id: string;
  /** Two-digit initiative score; empty while unset. */
  initiative: string;
  /** Token-style markup name (blank until a token is linked). */
  name: string;
  ac: string;
  hp: string;
  /** When false, players should not see this entry. Defaults to hidden. */
  visibleToPlayers: boolean;
  /** Per-field visibility for players. `false` hides that value (name → ???). */
  fieldVisibleToPlayers: InitiativeFieldVisibility;
  /** Linked map token id when this row was picked from the grid. */
  tokenId?: string;
};

const ALL_FIELDS_VISIBLE: InitiativeFieldVisibility = {
  initiative: true,
  name: true,
  ac: true,
  hp: true,
};

/** Columns hidden from players until the GM reveals them. */
const DEFAULT_COLUMN_VISIBLE_TO_PLAYERS: InitiativeFieldVisibility = {
  initiative: true,
  name: true,
  ac: false,
  hp: false,
};

function createEmptyEntry(): InitiativeEntry {
  return {
    id: newId(),
    initiative: '',
    name: '',
    ac: '',
    hp: '',
    visibleToPlayers: false,
    fieldVisibleToPlayers: { ...ALL_FIELDS_VISIBLE },
  };
}

/** Plain unsigned integer only (expressions / signed values are skipped). */
function isFlatStatNumber(value: string | undefined): boolean {
  return /^\d+$/.test((value ?? '').trim());
}

/** d20 + token initiative modifier/expression, clamped to the tracker field. */
function rollInitiativeFromToken(token: Token): string {
  const d20 = Math.floor(Math.random() * 20) + 1;
  const raw = (token.initiative ?? '').trim();
  let bonus = 0;
  if (raw) {
    const evaluated = evaluateStatExpression(raw);
    if (evaluated != null) bonus = evaluated;
  }
  return String(Math.min(99, Math.max(0, d20 + bonus)));
}

function entryFromToken(token: Token): InitiativeEntry {
  return {
    ...createEmptyEntry(),
    name: token.name,
    initiative: rollInitiativeFromToken(token),
    ac: isFlatStatNumber(token.ac) ? token.ac!.trim() : '',
    hp: isFlatStatNumber(token.hp) ? token.hp!.trim() : '',
    tokenId: token.id,
  };
}

function clampTwoDigit(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 2);
}

function clampStat(raw: string, maxDigits = 3): string {
  return raw.replace(/\D/g, '').slice(0, maxDigits);
}

function initiativeValue(raw: string): number {
  if (raw === '') return Number.NEGATIVE_INFINITY;
  return Number(raw);
}

function sortByInitiativeDescending(entries: InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort((a, b) => initiativeValue(b.initiative) - initiativeValue(a.initiative));
}

/** Map entry id → "(A)" / "(B)" when multiple rows share the same plain name. */
function duplicateNameLabels(entries: InitiativeEntry[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = plainTokenName(entry.name).trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const nextIndex = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const entry of entries) {
    const key = plainTokenName(entry.name).trim().toLowerCase();
    if (!key || (counts.get(key) ?? 0) < 2) continue;
    const i = nextIndex.get(key) ?? 0;
    nextIndex.set(key, i + 1);
    labels.set(entry.id, `(${duplicateLetterLabel(i)})`);
  }
  return labels;
}

function duplicateLetterLabel(index: number): string {
  let n = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

const COLS = 'grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_2.25rem_2.75rem]';

const FIELD_ORDER = ['initiative', 'name', 'ac', 'hp'] as const;
type FieldKey = InitiativeFieldKey;
type NavDir = 'left' | 'right' | 'up' | 'down';

function fieldVisibleToPlayers(
  entry: InitiativeEntry,
  field: FieldKey,
  columnVisible: InitiativeFieldVisibility = ALL_FIELDS_VISIBLE,
): boolean {
  return (
    columnVisible[field] !== false && entry.fieldVisibleToPlayers[field] !== false
  );
}

/** GM cue when a field is hidden from players during visibility editing. */
function fieldVisibilityCueClass(
  visibilityMode: boolean,
  visibleToPlayers: boolean,
): string {
  if (!visibilityMode) return '';
  return visibleToPlayers
    ? 'ring-1 ring-sky-500/40'
    : 'opacity-45 ring-1 ring-dashed ring-slate-500';
}

function parseFieldNavKey(e: { key: string; shiftKey: boolean }): NavDir | null {
  if (e.key === 'Tab') return e.shiftKey ? 'left' : 'right';
  if (e.key === 'Enter') return e.shiftKey ? 'up' : 'down';
  if (e.key === 'ArrowLeft') return 'left';
  if (e.key === 'ArrowRight') return 'right';
  if (e.key === 'ArrowUp') return 'up';
  if (e.key === 'ArrowDown') return 'down';
  return null;
}

function nextCell(
  rowIndex: number,
  field: FieldKey,
  dir: NavDir,
  rowCount: number,
): { rowIndex: number; field: FieldKey } | null {
  let nextRow = rowIndex;
  let nextCol = FIELD_ORDER.indexOf(field);
  if (dir === 'left') {
    nextCol -= 1;
    if (nextCol < 0) {
      nextCol = FIELD_ORDER.length - 1;
      nextRow -= 1;
    }
  } else if (dir === 'right') {
    nextCol += 1;
    if (nextCol >= FIELD_ORDER.length) {
      nextCol = 0;
      nextRow += 1;
    }
  } else if (dir === 'up') {
    nextRow -= 1;
  } else {
    nextRow += 1;
  }
  if (nextRow < 0 || nextRow >= rowCount) return null;
  return { rowIndex: nextRow, field: FIELD_ORDER[nextCol]! };
}

function focusInitiativeField(
  list: HTMLElement,
  entryId: string,
  field: FieldKey,
): void {
  const selector = `[data-initiative-row="${CSS.escape(entryId)}"] [data-initiative-field="${field}"]`;
  const el = list.querySelector<HTMLElement>(selector);
  if (!el) return;

  if (field === 'name' && el instanceof HTMLButtonElement) {
    el.click();
    requestAnimationFrame(() => {
      const input = list.querySelector<HTMLInputElement>(
        `[data-initiative-row="${CSS.escape(entryId)}"] input[data-initiative-field="name"]`,
      );
      input?.focus();
      input?.select();
    });
    return;
  }

  el.focus();
  if (el instanceof HTMLInputElement) el.select();
}

const fieldClass =
  'min-h-8 rounded border border-slate-600 bg-slate-800 px-1.5 text-center text-sm text-slate-100 tabular-nums outline-none focus:border-sky-500';

const nameInputClass =
  'min-h-8 w-full min-w-0 rounded border border-slate-600 bg-slate-800 px-2 text-sm text-slate-100 outline-none focus:border-sky-500';

type NameFieldProps = {
  value: string;
  onChange: (name: string) => void;
  onEditingChange?: (editing: boolean) => void;
  onNavigate?: (dir: NavDir) => boolean;
  /** e.g. "(A)" when multiple entries share this name. */
  duplicateLabel?: string;
  /** Player view: show ??? and block editing. */
  concealFromPlayer?: boolean;
  /** Player view with field visible — read-only display. */
  asPlayer?: boolean;
  visibilityMode?: boolean;
  fieldVisible?: boolean;
  onToggleFieldVisible?: () => void;
};

function DuplicateNameBadge({ label }: { label: string }) {
  return (
    <span className="ml-1 shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
      {label}
    </span>
  );
}

function InitiativeNameField({
  value,
  onChange,
  onEditingChange,
  onNavigate,
  duplicateLabel,
  concealFromPlayer = false,
  asPlayer = false,
  visibilityMode = false,
  fieldVisible = true,
  onToggleFieldVisible,
}: NameFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    onEditingChangeRef.current?.(editing);
  }, [editing]);

  useEffect(() => () => onEditingChangeRef.current?.(false), []);

  const commit = (next = draft) => {
    onChange(next);
    setEditing(false);
  };

  const startEditing = () => {
    if (concealFromPlayer || visibilityMode) return;
    setDraft(value);
    setEditing(true);
  };

  const handleNavKey = (e: ReactKeyboardEvent) => {
    if (concealFromPlayer) return;
    if (e.key === 'Escape' && editing) {
      e.preventDefault();
      setDraft(value);
      setEditing(false);
      return;
    }
    const dir = parseFieldNavKey(e);
    if (!dir) return;
    if (editing) commit();
    const moved = onNavigate?.(dir) ?? false;
    if (moved || e.key !== 'Tab') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const cue = fieldVisibilityCueClass(visibilityMode, fieldVisible);

  if (concealFromPlayer) {
    return (
      <div
        data-initiative-field="name"
        className={`flex min-h-8 min-w-0 flex-1 items-center rounded border border-transparent px-2 ${cue}`}
        aria-label="Hidden name"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-wide text-slate-400">
          ???
        </span>
        {duplicateLabel ? <DuplicateNameBadge label={duplicateLabel} /> : null}
      </div>
    );
  }

  if (asPlayer) {
    const plain = plainTokenName(value);
    return (
      <div
        data-initiative-field="name"
        className="flex min-h-8 min-w-0 flex-1 items-center rounded border border-transparent px-2"
        aria-label={plain || 'Creature name'}
      >
        {value.trim() ? (
          <StyledTokenName
            value={value}
            className="min-w-0 flex-1 truncate text-sm"
            title={plain}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-slate-500">—</span>
        )}
        {duplicateLabel ? <DuplicateNameBadge label={duplicateLabel} /> : null}
      </div>
    );
  }

  if (visibilityMode) {
    return (
      <button
        type="button"
        data-initiative-field="name"
        className={`flex min-h-8 min-w-0 flex-1 items-center rounded border border-transparent px-2 text-left hover:border-slate-600 hover:bg-slate-800/60 ${cue}`}
        onClick={() => onToggleFieldVisible?.()}
        title={
          fieldVisible
            ? 'Hide name from players'
            : 'Show name to players'
        }
        aria-pressed={fieldVisible}
        aria-label={
          fieldVisible ? 'Name visible to players' : 'Name hidden from players'
        }
      >
        {value.trim() ? (
          <StyledTokenName
            value={value}
            className="min-w-0 flex-1 truncate text-sm"
            title={plainTokenName(value)}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-slate-500">Name</span>
        )}
        {duplicateLabel ? <DuplicateNameBadge label={duplicateLabel} /> : null}
      </button>
    );
  }

  if (editing) {
    return (
      <div className="flex min-h-8 min-w-0 flex-1 items-center gap-1">
        <input
          ref={inputRef}
          data-initiative-field="name"
          className={nameInputClass}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={handleNavKey}
          autoFocus
          aria-label="Creature name"
          placeholder="Name"
        />
        {duplicateLabel ? <DuplicateNameBadge label={duplicateLabel} /> : null}
      </div>
    );
  }

  const plain = plainTokenName(value);
  return (
    <button
      type="button"
      data-initiative-field="name"
      className="flex min-h-8 min-w-0 flex-1 items-center rounded border border-transparent px-2 text-left hover:border-slate-600 hover:bg-slate-800/60 focus:border-sky-500 focus:outline-none"
      onClick={startEditing}
      onKeyDown={handleNavKey}
      aria-label={plain ? `Edit name ${plain}` : 'Edit creature name'}
    >
      {value.trim() ? (
        <StyledTokenName
          value={value}
          className="min-w-0 flex-1 truncate text-sm"
          title={plain}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-slate-500">Name</span>
      )}
      {duplicateLabel ? <DuplicateNameBadge label={duplicateLabel} /> : null}
    </button>
  );
}

type RowProps = {
  entry: InitiativeEntry;
  index: number;
  duplicateLabel?: string;
  isDragging: boolean;
  tokenSelected: boolean;
  deleteMode: boolean;
  visibilityMode: boolean;
  asPlayer: boolean;
  columnVisible: InitiativeFieldVisibility;
  onPatch: (id: string, patch: Partial<InitiativeEntry>) => void;
  onDelete: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleFieldVisible: (id: string, field: FieldKey) => void;
  onGripPointerDown: (id: string, e: ReactPointerEvent<HTMLButtonElement>) => void;
  onNameEditingChange: (id: string, editing: boolean) => void;
  onNavigate: (entryId: string, field: FieldKey, dir: NavDir) => boolean;
  onHoverToken: (tokenId: string | null) => void;
};

function StatField({
  field,
  value,
  maxLength,
  ariaLabel,
  visibilityMode,
  fieldVisible,
  concealFromPlayer,
  asPlayer,
  onChange,
  onKeyDown,
  onToggleFieldVisible,
}: {
  field: Exclude<FieldKey, 'name'>;
  value: string;
  maxLength: number;
  ariaLabel: string;
  visibilityMode: boolean;
  fieldVisible: boolean;
  concealFromPlayer: boolean;
  asPlayer: boolean;
  onChange: (value: string) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  onToggleFieldVisible: () => void;
}) {
  const cue = fieldVisibilityCueClass(visibilityMode, fieldVisible);

  if (concealFromPlayer) {
    return (
      <div
        data-initiative-field={field}
        className={`${fieldClass} pointer-events-none border-transparent bg-transparent ${cue}`}
        aria-hidden
      />
    );
  }

  if (asPlayer) {
    return (
      <div
        data-initiative-field={field}
        className={fieldClass}
        aria-label={ariaLabel}
      >
        <span className="tabular-nums">{value || '—'}</span>
      </div>
    );
  }

  if (visibilityMode) {
    return (
      <button
        type="button"
        data-initiative-field={field}
        className={`${fieldClass} cursor-pointer ${cue}`}
        onClick={onToggleFieldVisible}
        title={
          fieldVisible
            ? `Hide ${ariaLabel.toLowerCase()} from players`
            : `Show ${ariaLabel.toLowerCase()} to players`
        }
        aria-pressed={fieldVisible}
        aria-label={
          fieldVisible
            ? `${ariaLabel} visible to players`
            : `${ariaLabel} hidden from players`
        }
      >
        <span className="tabular-nums">{value || '—'}</span>
      </button>
    );
  }

  return (
    <input
      data-initiative-field={field}
      className={fieldClass}
      inputMode="numeric"
      maxLength={maxLength}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      placeholder="—"
    />
  );
}

function InitiativeRow({
  entry,
  index,
  duplicateLabel,
  isDragging,
  tokenSelected,
  deleteMode,
  visibilityMode,
  asPlayer,
  columnVisible,
  onPatch,
  onDelete,
  onToggleVisible,
  onToggleFieldVisible,
  onGripPointerDown,
  onNameEditingChange,
  onNavigate,
  onHoverToken,
}: RowProps) {
  const label = plainTokenName(entry.name) || 'entry';
  const stripe = index % 2 === 1;
  const initiativeEntryVisible = entry.fieldVisibleToPlayers.initiative !== false;
  const nameEntryVisible = entry.fieldVisibleToPlayers.name !== false;
  const acEntryVisible = entry.fieldVisibleToPlayers.ac !== false;
  const hpEntryVisible = entry.fieldVisibleToPlayers.hp !== false;
  const initiativeShown = fieldVisibleToPlayers(entry, 'initiative', columnVisible);
  const nameShown = fieldVisibleToPlayers(entry, 'name', columnVisible);
  const acShown = fieldVisibleToPlayers(entry, 'ac', columnVisible);
  const hpShown = fieldVisibleToPlayers(entry, 'hp', columnVisible);

  const handleFieldKeyDown =
    (field: FieldKey) => (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (asPlayer || visibilityMode) return;
      const dir = parseFieldNavKey(e);
      if (!dir) return;
      const moved = onNavigate(entry.id, field, dir);
      if (moved || e.key !== 'Tab') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

  let leadingControl: ReactNode;
  if (asPlayer) {
    leadingControl = <span aria-hidden className="block h-8 w-5" />;
  } else if (deleteMode) {
    leadingControl = (
      <button
        type="button"
        className="flex h-8 w-5 items-center justify-center rounded text-red-400 hover:bg-red-950/60 hover:text-red-300"
        aria-label={`Delete ${label}`}
        title="Delete entry"
        onClick={() => onDelete(entry.id)}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    );
  } else if (visibilityMode) {
    leadingControl = (
      <button
        type="button"
        className={`flex h-8 w-5 items-center justify-center rounded ${
          entry.visibleToPlayers
            ? 'text-sky-300 hover:bg-slate-800 hover:text-sky-200'
            : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
        }`}
        aria-label={
          entry.visibleToPlayers
            ? `Hide ${label} from players`
            : `Show ${label} to players`
        }
        aria-pressed={entry.visibleToPlayers}
        title={
          entry.visibleToPlayers ? 'Visible to players' : 'Hidden from players'
        }
        onClick={() => onToggleVisible(entry.id)}
      >
        <VisibilityIcon visible={entry.visibleToPlayers} className="h-4 w-4" />
      </button>
    );
  } else {
    leadingControl = (
      <button
        type="button"
        className="flex h-8 w-5 cursor-grab touch-none items-center justify-center rounded text-slate-500 hover:bg-slate-800 hover:text-slate-300 active:cursor-grabbing"
        aria-label={`Reorder ${label}`}
        title="Drag to reorder"
        onPointerDown={(e) => onGripPointerDown(entry.id, e)}
      >
        <GripDotsIcon className="h-4 w-2.5" />
      </button>
    );
  }

  return (
    <li
      data-initiative-row={entry.id}
      className={`relative will-change-transform ${isDragging ? 'z-20 opacity-95 shadow-lg shadow-black/40' : ''}`}
      style={isDragging ? { touchAction: 'none' } : undefined}
      onPointerEnter={() => {
        if (entry.tokenId) onHoverToken(entry.tokenId);
      }}
      onPointerLeave={() => onHoverToken(null)}
    >
      <div
        className={`grid ${COLS} items-center gap-1.5 rounded-lg px-1 py-1 ${
          isDragging
            ? 'bg-slate-800 ring-1 ring-sky-400/70'
            : tokenSelected
              ? !asPlayer && !entry.visibleToPlayers
                ? stripe
                  ? 'bg-red-950/55 text-red-100/90 ring-2 ring-sky-400'
                  : 'bg-red-950/30 text-red-100/90 ring-2 ring-sky-400'
                : stripe
                  ? 'bg-slate-800/70 ring-2 ring-sky-400'
                  : 'bg-slate-900/40 ring-2 ring-sky-400'
              : !asPlayer && !entry.visibleToPlayers
                ? stripe
                  ? 'bg-red-950/55 text-red-100/90 ring-1 ring-red-900/55'
                  : 'bg-red-950/30 text-red-100/90 ring-1 ring-red-900/40'
                : stripe
                  ? 'bg-slate-800/70 hover:bg-slate-800'
                  : 'bg-slate-900/40 hover:bg-slate-800/50'
        }`}
      >
        {leadingControl}

        <StatField
          field="initiative"
          value={entry.initiative}
          maxLength={2}
          ariaLabel="Initiative"
          visibilityMode={visibilityMode}
          fieldVisible={initiativeEntryVisible}
          concealFromPlayer={asPlayer && !initiativeShown}
          asPlayer={asPlayer}
          onChange={(v) => onPatch(entry.id, { initiative: clampTwoDigit(v) })}
          onKeyDown={handleFieldKeyDown('initiative')}
          onToggleFieldVisible={() => onToggleFieldVisible(entry.id, 'initiative')}
        />

        <InitiativeNameField
          value={entry.name}
          duplicateLabel={duplicateLabel}
          onChange={(name) => onPatch(entry.id, { name })}
          onEditingChange={(editing) => onNameEditingChange(entry.id, editing)}
          onNavigate={(dir) => onNavigate(entry.id, 'name', dir)}
          concealFromPlayer={asPlayer && !nameShown}
          asPlayer={asPlayer}
          visibilityMode={visibilityMode}
          fieldVisible={nameEntryVisible}
          onToggleFieldVisible={() => onToggleFieldVisible(entry.id, 'name')}
        />

        <StatField
          field="ac"
          value={entry.ac}
          maxLength={3}
          ariaLabel="Armor class"
          visibilityMode={visibilityMode}
          fieldVisible={acEntryVisible}
          concealFromPlayer={asPlayer && !acShown}
          asPlayer={asPlayer}
          onChange={(v) => onPatch(entry.id, { ac: clampStat(v) })}
          onKeyDown={handleFieldKeyDown('ac')}
          onToggleFieldVisible={() => onToggleFieldVisible(entry.id, 'ac')}
        />

        <StatField
          field="hp"
          value={entry.hp}
          maxLength={4}
          ariaLabel="Hit points"
          visibilityMode={visibilityMode}
          fieldVisible={hpEntryVisible}
          concealFromPlayer={asPlayer && !hpShown}
          asPlayer={asPlayer}
          onChange={(v) => onPatch(entry.id, { hp: clampStat(v, 4) })}
          onKeyDown={handleFieldKeyDown('hp')}
          onToggleFieldVisible={() => onToggleFieldVisible(entry.id, 'hp')}
        />
      </div>
    </li>
  );
}

export function InitiativeTracker() {
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const isGm = role === 'gm' && !playerView;
  const asPlayer = seesAsPlayer(role, playerView);
  const scene = useActiveScene();
  const pickActive = useStore((s) => s.initiativeTokenPickActive);
  const pendingPickTokenIds = useStore((s) => s.initiativePendingPickTokenIds);
  const setInitiativeTokenPickActive = useStore((s) => s.setInitiativeTokenPickActive);
  const setInitiativeLinkedTokenIds = useStore((s) => s.setInitiativeLinkedTokenIds);
  const clearInitiativePendingPick = useStore((s) => s.clearInitiativePendingPick);
  const setInitiativeHoveredTokenId = useStore((s) => s.setInitiativeHoveredTokenId);
  const selectedTokenIds = useStore((s) => s.selectedTokenIds);
  const [entries, setEntries] = useState<InitiativeEntry[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [visibilityMode, setVisibilityMode] = useState(false);
  const [columnVisible, setColumnVisible] = useState<InitiativeFieldVisibility>(
    () => ({ ...DEFAULT_COLUMN_VISIBLE_TO_PLAYERS }),
  );
  const listRef = useRef<HTMLUListElement>(null);
  const positionsRef = useRef<Map<string, number>>(new Map());
  const draggingIdRef = useRef<string | null>(null);
  /** Pointer Y minus the dragged row's untransformed top (keeps grab point locked). */
  const dragGrabOffsetRef = useRef(0);
  const lastDragClientYRef = useRef(0);
  draggingIdRef.current = draggingId;

  const displayEntries = asPlayer
    ? entries.filter((entry) => entry.visibleToPlayers)
    : entries;
  const nameDuplicateLabels = duplicateNameLabels(displayEntries);
  const selectedTokenIdSet = new Set(selectedTokenIds);

  useEffect(() => {
    const linked = entries
      .map((e) => e.tokenId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    setInitiativeLinkedTokenIds(linked);
  }, [entries, setInitiativeLinkedTokenIds]);

  useEffect(() => {
    return () => {
      setInitiativeTokenPickActive(false);
      setInitiativeLinkedTokenIds([]);
      setInitiativeHoveredTokenId(null);
    };
  }, [
    setInitiativeTokenPickActive,
    setInitiativeLinkedTokenIds,
    setInitiativeHoveredTokenId,
  ]);

  useEffect(() => {
    if (pendingPickTokenIds.length === 0 || !scene) return;
    const tokens = pendingPickTokenIds
      .map((id) => scene.tokens.find((t) => t.id === id))
      .filter((t): t is Token => t != null);
    clearInitiativePendingPick();
    if (tokens.length === 0) return;
    setEntries((prev) => {
      const linked = new Set(
        prev.map((e) => e.tokenId).filter((id): id is string => typeof id === 'string'),
      );
      const added = tokens
        .filter((t) => !linked.has(t.id))
        .map((t) => entryFromToken(t));
      return added.length > 0 ? [...prev, ...added] : prev;
    });
    setInitiativeTokenPickActive(false);
  }, [
    pendingPickTokenIds,
    scene,
    clearInitiativePendingPick,
    setInitiativeTokenPickActive,
  ]);

  useEffect(() => {
    if (!pickActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setInitiativeTokenPickActive(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pickActive, setInitiativeTokenPickActive]);

  const patchEntry = (id: string, patch: Partial<InitiativeEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const addEntry = () => {
    setInitiativeTokenPickActive(false);
    setEntries((prev) => [...prev, createEmptyEntry()]);
  };

  const toggleTokenPick = () => {
    setDeleteMode(false);
    setVisibilityMode(false);
    setInitiativeTokenPickActive(!pickActive);
  };

  const deleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const toggleEntryVisible = (id: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, visibleToPlayers: !e.visibleToPlayers } : e,
      ),
    );
  };

  const toggleFieldVisible = (id: string, field: FieldKey) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const currentlyVisible = e.fieldVisibleToPlayers[field] !== false;
        return {
          ...e,
          fieldVisibleToPlayers: {
            ...e.fieldVisibleToPlayers,
            [field]: !currentlyVisible,
          },
        };
      }),
    );
  };

  const toggleColumnVisible = (field: FieldKey) => {
    setColumnVisible((prev) => ({
      ...prev,
      [field]: prev[field] === false,
    }));
  };

  const sortEntries = () => {
    setEntries((prev) => sortByInitiativeDescending(prev));
  };

  const resetEntries = async () => {
    if (entries.length === 0) return;
    const confirmed = await confirmAction({
      title: 'Reset initiative',
      message: 'Clear all initiative entries? This cannot be undone.',
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (!confirmed) return;
    setEntries([]);
    setDeleteMode(false);
    setVisibilityMode(false);
    setInitiativeTokenPickActive(false);
  };

  const toggleDeleteMode = () => {
    setInitiativeTokenPickActive(false);
    setDeleteMode((v) => !v);
    setVisibilityMode(false);
  };

  const toggleVisibilityMode = () => {
    setInitiativeTokenPickActive(false);
    setVisibilityMode((v) => !v);
    setDeleteMode(false);
  };

  const navigateField = (entryId: string, field: FieldKey, dir: NavDir): boolean => {
    const rowIndex = displayEntries.findIndex((entry) => entry.id === entryId);
    if (rowIndex < 0) return false;
    const target = nextCell(rowIndex, field, dir, displayEntries.length);
    if (!target) return false;
    const nextEntry = displayEntries[target.rowIndex];
    if (!nextEntry) return false;
    const list = listRef.current;
    if (!list) return false;
    // Wait for name-field commit/unmount to settle before moving focus.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusInitiativeField(list, nextEntry.id, target.field);
      });
    });
    return true;
  };

  const syncRowPositions = () => {
    const list = listRef.current;
    if (!list) return;
    list.querySelectorAll<HTMLElement>('[data-initiative-row]').forEach((row) => {
      const id = row.dataset.initiativeRow;
      if (!id) return;
      const transform = row.style.transform;
      row.style.transform = '';
      positionsRef.current.set(id, row.getBoundingClientRect().top);
      row.style.transform = transform;
    });
  };

  const placeDraggedRow = (clientY: number) => {
    const dragId = draggingIdRef.current;
    const list = listRef.current;
    if (!dragId || !list) return;
    const row = list.querySelector<HTMLElement>(
      `[data-initiative-row="${CSS.escape(dragId)}"]`,
    );
    if (!row) return;
    row.style.transition = 'none';
    row.style.transform = '';
    const layoutTop = row.getBoundingClientRect().top;
    const translateY = clientY - dragGrabOffsetRef.current - layoutTop;
    row.style.transform = `translateY(${translateY}px)`;
    row.style.zIndex = '20';
    positionsRef.current.set(dragId, layoutTop);
  };

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const dragId = draggingIdRef.current;
    const rows = list.querySelectorAll<HTMLElement>('[data-initiative-row]');

    rows.forEach((row) => {
      const id = row.dataset.initiativeRow;
      if (!id || id === dragId) return;

      row.style.transition = 'none';
      row.style.zIndex = '';
      row.style.transform = '';
      const nextTop = row.getBoundingClientRect().top;
      const prevTop = positionsRef.current.get(id);
      if (prevTop != null) {
        const dy = prevTop - nextTop;
        if (Math.abs(dy) > 1) {
          row.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => {
            row.style.transition = 'transform 200ms ease-out';
            row.style.transform = '';
          });
        }
      }
      positionsRef.current.set(id, nextTop);
    });

    if (dragId != null) {
      placeDraggedRow(lastDragClientYRef.current);
    }
  }, [entries]);

  /**
   * Insert the dragged id before the first *other* row whose midpoint is below
   * the pointer (or at the end). Uses layout offsets so FLIP transforms do not
   * skew hit-testing while rows animate.
   */
  const orderForPointer = (
    prev: InitiativeEntry[],
    dragId: string,
    clientY: number,
  ): InitiativeEntry[] => {
    const list = listRef.current;
    if (!list) return prev;

    const listRect = list.getBoundingClientRect();
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-initiative-row]'));
    let insertBeforeId: string | null = null;
    for (const row of rows) {
      const rowId = row.dataset.initiativeRow;
      if (!rowId || rowId === dragId) continue;
      const top = listRect.top + row.offsetTop - list.scrollTop;
      if (clientY < top + row.offsetHeight / 2) {
        insertBeforeId = rowId;
        break;
      }
    }

    const from = prev.findIndex((entry) => entry.id === dragId);
    if (from < 0) return prev;
    const dragged = prev[from]!;
    const without = prev.filter((entry) => entry.id !== dragId);
    const insertAt =
      insertBeforeId == null
        ? without.length
        : without.findIndex((entry) => entry.id === insertBeforeId);
    if (insertAt < 0) return prev;

    const next = [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)];
    if (next.every((entry, i) => entry.id === prev[i]?.id)) return prev;
    return next;
  };

  const onGripPointerDown = (id: string, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const pointerId = e.pointerId;
    const list = listRef.current;
    setDraggingId(id);
    draggingIdRef.current = id;
    lastDragClientYRef.current = e.clientY;

    // Clear any in-flight FLIP transforms before hit-testing.
    list?.querySelectorAll<HTMLElement>('[data-initiative-row]').forEach((row) => {
      row.style.transition = 'none';
      row.style.transform = '';
      row.style.zIndex = '';
    });
    syncRowPositions();

    const dragRow = list?.querySelector<HTMLElement>(
      `[data-initiative-row="${CSS.escape(id)}"]`,
    );
    if (dragRow) {
      const layoutTop = dragRow.getBoundingClientRect().top;
      dragGrabOffsetRef.current = e.clientY - layoutTop;
      positionsRef.current.set(id, layoutTop);
      dragRow.style.transition = 'none';
      dragRow.style.zIndex = '20';
      dragRow.style.transform = 'translateY(0px)';
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      lastDragClientYRef.current = ev.clientY;
      setEntries((prev) => orderForPointer(prev, id, ev.clientY));
      placeDraggedRow(ev.clientY);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      draggingIdRef.current = null;
      setDraggingId(null);
      const row = listRef.current?.querySelector<HTMLElement>(
        `[data-initiative-row="${CSS.escape(id)}"]`,
      );
      if (row) {
        row.style.transition = 'transform 180ms ease-out';
        row.style.transform = '';
        row.style.zIndex = '';
      }
      requestAnimationFrame(syncRowPositions);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex h-full flex-col bg-slate-900">
        <div className="flex min-h-0 flex-1 flex-col">
          <header
            className={`safe-top flex items-center justify-between border-b border-slate-700 px-3 py-2 ${
              pickActive && !asPlayer ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            <h2 className="text-sm font-semibold">Initiative Tracker</h2>
          </header>

          <div
            className={`grid shrink-0 ${COLS} items-center gap-1.5 border-b border-slate-800 px-3 py-1.5 text-slate-400 ${
              pickActive && !asPlayer ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            <span aria-hidden className="block" />
            {(
              [
                {
                  field: 'initiative' as const,
                  title: 'Initiative',
                  icon: <DiceIcon className="h-3.5 w-3.5" />,
                },
                {
                  field: 'name' as const,
                  title: 'Name',
                  icon: <RenameIcon className="h-3.5 w-3.5" />,
                },
                {
                  field: 'ac' as const,
                  title: 'Armor class',
                  icon: <ShieldIcon className="h-3.5 w-3.5" />,
                },
                {
                  field: 'hp' as const,
                  title: 'Hit points',
                  icon: <HeartIcon className="h-3.5 w-3.5" />,
                },
              ] as const
            ).map(({ field, title, icon }) => {
              const shown = columnVisible[field] !== false;
              if (asPlayer) {
                return (
                  <span
                    key={field}
                    className={`flex justify-center ${shown ? '' : 'opacity-40'}`}
                    title={title}
                  >
                    {icon}
                    <span className="sr-only">{title}</span>
                  </span>
                );
              }
              return (
                <button
                  key={field}
                  type="button"
                  className={`flex items-center justify-center rounded p-0.5 transition-colors hover:bg-slate-800 hover:text-slate-200 ${
                    shown
                      ? 'text-slate-300'
                      : 'text-slate-500 opacity-60 ring-1 ring-dashed ring-slate-600'
                  }`}
                  title={
                    shown
                      ? `Hide ${title.toLowerCase()} column from players`
                      : `Show ${title.toLowerCase()} column to players`
                  }
                  aria-pressed={shown}
                  aria-label={
                    shown
                      ? `${title} visible to players`
                      : `${title} hidden from players`
                  }
                  onClick={() => toggleColumnVisible(field)}
                >
                  {icon}
                  <span className="sr-only">{title}</span>
                </button>
              );
            })}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
            <ul
              ref={listRef}
              className={`relative flex flex-col gap-0.5 ${
                pickActive && !asPlayer ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              {displayEntries.map((entry, index) => (
                <InitiativeRow
                  key={entry.id}
                  entry={entry}
                  index={index}
                  duplicateLabel={nameDuplicateLabels.get(entry.id)}
                  isDragging={draggingId === entry.id}
                  tokenSelected={
                    entry.tokenId != null && selectedTokenIdSet.has(entry.tokenId)
                  }
                  deleteMode={!asPlayer && deleteMode}
                  visibilityMode={isGm && visibilityMode}
                  asPlayer={asPlayer}
                  columnVisible={columnVisible}
                  onPatch={patchEntry}
                  onDelete={deleteEntry}
                  onToggleVisible={toggleEntryVisible}
                  onToggleFieldVisible={toggleFieldVisible}
                  onGripPointerDown={onGripPointerDown}
                  onNameEditingChange={(rowId, editing) =>
                    setEditingNameId(editing ? rowId : null)
                  }
                  onNavigate={navigateField}
                  onHoverToken={setInitiativeHoveredTokenId}
                />
              ))}
            </ul>

            {!asPlayer && (
              <div
                className="mt-2 flex min-h-11 w-full overflow-hidden rounded-lg border-2 border-dashed border-slate-600 bg-slate-900/50"
                role="group"
                aria-label="Add initiative entry"
              >
                <button
                  type="button"
                  onClick={addEntry}
                  className="flex min-w-0 flex-1 items-center justify-center rounded-none text-xl font-light text-slate-400 transition-colors hover:bg-sky-950/20 hover:text-sky-200"
                  aria-label="Add blank entry"
                  title="Add blank entry"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={toggleTokenPick}
                  aria-pressed={pickActive}
                  aria-label={pickActive ? 'Cancel token pick' : 'Pick token from map'}
                  title={pickActive ? 'Cancel (Esc)' : 'Pick token from map'}
                  className={`flex min-w-0 flex-1 items-center justify-center rounded-none border-l-2 border-dashed border-slate-600 px-1 text-center text-[11px] font-medium leading-tight transition-colors ${
                    pickActive
                      ? 'bg-sky-600 text-white outline outline-2 outline-offset-[-2px] outline-sky-300'
                      : 'text-slate-400 hover:bg-sky-950/20 hover:text-sky-200'
                  }`}
                >
                  {pickActive ? (
                    <span>pick a token</span>
                  ) : (
                    <EyedropperIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {editingNameId != null && !asPlayer && (
          <div className="shrink-0 border-t border-slate-800 px-3 py-1.5">
            <TokenNameSyntaxHint />
          </div>
        )}

        {!asPlayer && (
        <div
          className={`safe-bottom shrink-0 border-t border-slate-700 py-1 ${
            pickActive ? 'pointer-events-none opacity-40' : ''
          }`}
        >
          <div className="flex h-12 min-h-0 w-full items-stretch">
            <ToolOptionPanelRow>
              <ToolOptionButton
                label="Sort"
                title="Sort by initiative (high to low)"
                onClick={sortEntries}
              >
                <SortDescendingIcon className="h-5 w-5 shrink-0" />
              </ToolOptionButton>
              <ToolOptionToggle
                label="Delete"
                active={deleteMode}
                title={deleteMode ? 'Done deleting' : 'Delete entries'}
                onClick={toggleDeleteMode}
                activeClassName="border-red-500 bg-red-600 text-white hover:bg-red-600"
              >
                <TrashIcon className="h-5 w-5 shrink-0" />
              </ToolOptionToggle>
              {isGm ? (
                <ToolOptionToggle
                  label="Visibility"
                  active={visibilityMode}
                  tone="sky"
                  title={
                    visibilityMode
                      ? 'Done editing visibility'
                      : 'Toggle player visibility'
                  }
                  onClick={toggleVisibilityMode}
                >
                  <VisibilityIcon visible className="h-5 w-5 shrink-0" />
                </ToolOptionToggle>
              ) : null}
              <ToolOptionButton
                label="Reset"
                title="Reset initiative tracker"
                onClick={() => void resetEntries()}
              >
                <ResetIcon className="h-5 w-5 shrink-0" />
              </ToolOptionButton>
            </ToolOptionPanelRow>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
