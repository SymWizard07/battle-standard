import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { DrawOutlineSlider } from './DrawOutlineSlider';

/** Reserved height for group header labels so control rows align. */
const GROUP_LABEL_CLASS =
  'flex min-h-[14px] shrink-0 items-end justify-center text-[10px] leading-none';

const BUTTON_CELL =
  'flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1 text-[10px] font-medium';

type ActionButtonProps = {
  label: string;
  onClick?: () => void;
  title?: string;
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
};

/** Action button — copy, delete, upload, clear. Flat inactive surface, no pressed state. */
export function ToolOptionButton({
  label,
  onClick,
  title,
  className = '',
  disabled = false,
  children,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`${BUTTON_CELL} rounded-lg border border-slate-700/80 bg-slate-800/20 text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}

export type ToggleTone = 'sky' | 'emerald' | 'amber' | 'violet';

const TOGGLE_TONE_ACTIVE: Record<ToggleTone, string> = {
  sky: 'border-sky-500 bg-sky-600 text-white hover:bg-sky-600',
  emerald: 'border-emerald-500 bg-emerald-700 text-white hover:bg-emerald-700',
  amber: 'border-amber-500 bg-amber-600 text-white hover:bg-amber-600',
  violet: 'border-violet-500 bg-violet-600 text-white hover:bg-violet-600',
};

type ToggleProps = {
  label: string;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
  activeClassName?: string;
  tone?: ToggleTone;
  disabled?: boolean;
  children?: ReactNode;
};

/** Toggle button — distinct pressed state with optional color tone. */
export function ToolOptionToggle({
  label,
  active = false,
  onClick,
  title,
  className = '',
  activeClassName,
  tone = 'sky',
  disabled = false,
  children,
}: ToggleProps) {
  const inactiveStyles =
    'border-slate-600 bg-slate-800/40 text-slate-400 hover:border-slate-500 hover:bg-slate-800/70 hover:text-slate-200';
  const activeStyles = activeClassName ?? TOGGLE_TONE_ACTIVE[tone];

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`${BUTTON_CELL} rounded-lg border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? activeStyles : inactiveStyles
      } ${className}`}
    >
      {children}
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}

/** Slot weight for equal button sizing across the full row width. */
export function toolOptionSlotWeight(child: ReactNode): number {
  if (!isValidElement(child)) return 0;
  if (child.type === ToolOptionSegmentedControl) {
    return (child.props as { segments: unknown[] }).segments.length;
  }
  if (child.type === ToolOptionBar) {
    return 2;
  }
  if (child.type === DrawOutlineSlider) {
    return 2;
  }
  return 1;
}

function countSlots(children: ReactNode): number {
  let total = 0;
  Children.forEach(children, (child) => {
    total += toolOptionSlotWeight(child);
  });
  return Math.max(1, total);
}

function slotFlexStyle(weight: number): { flex: string } {
  return { flex: `${weight} 1 0%` };
}

export function ToolOptionGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const slots = countSlots(children);
  const items = Children.toArray(children);

  return (
    <div className="flex h-full min-w-0 flex-col gap-0.5" style={slotFlexStyle(slots)}>
      {title ? (
        <span
          className={`${GROUP_LABEL_CLASS} font-semibold uppercase tracking-wide text-slate-500`}
        >
          {title}
        </span>
      ) : (
        <span className={`${GROUP_LABEL_CLASS} text-slate-500`} aria-hidden>
          {'\u00A0'}
        </span>
      )}
      <div className="flex min-h-0 w-full flex-1 items-stretch gap-1">
        {items.map((child, index) => {
          const weight = toolOptionSlotWeight(child);
          if (weight <= 0) return null;
          return (
            <div
              key={index}
              className="flex min-h-0 min-w-0 items-stretch"
              style={slotFlexStyle(weight)}
            >
              {child}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Standalone control — same full-height slot as a group, without a header label. */
export function ToolOptionStandalone({ children }: { children: ReactNode }) {
  return <ToolOptionGroup>{children}</ToolOptionGroup>;
}

export type ToolOptionSegment = {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  icon?: ReactNode;
  activeClassName?: string;
};

export function ToolOptionSegmentedControl({
  segments,
  tone = 'sky',
  className = '',
}: {
  segments: ToolOptionSegment[];
  tone?: ToggleTone;
  className?: string;
}) {
  const activeDefault = TOGGLE_TONE_ACTIVE[tone];

  return (
    <div
      className={`flex h-full w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-slate-700/80 ${className}`}
      role="group"
    >
      {segments.map((seg, i) => (
        <button
          key={seg.id}
          type="button"
          aria-pressed={seg.active}
          title={seg.title}
          disabled={seg.disabled}
          onClick={seg.onClick}
          className={`flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            i > 0 ? 'border-l border-slate-700/80' : ''
          } ${
            seg.active
              ? seg.activeClassName ?? activeDefault
              : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
          }`}
        >
          {seg.icon}
          <span className="text-center leading-tight">{seg.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ToolOptionSeparator() {
  return <div className="w-px shrink-0 self-stretch bg-slate-700/80" aria-hidden />;
}

export function ToolOptionShortcutBadge({
  label,
  className = '',
}: {
  label: string | number;
  className?: string;
}) {
  return (
    <span
      className={`text-[9px] font-bold leading-none text-slate-500 ${className}`}
      aria-hidden
    >
      [{label}]
    </span>
  );
}

type BarProps = {
  label: string;
  children: ReactNode;
};

/** Wider inline bar control (e.g. outline slider) — counts as 2 button slots. */
export function ToolOptionBar({ label, children }: BarProps) {
  return (
    <div className="flex h-full w-full min-w-0 items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-800/30 px-2">
      <span className="shrink-0 text-[10px] font-medium text-slate-400">{label}</span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}

function isHiddenRowChild(child: ReactNode): boolean {
  if (!isValidElement(child)) return false;
  if (child.type !== 'input') return false;
  const props = child.props as { className?: string };
  return props.className?.includes('hidden') ?? false;
}

export function ToolOptionPanelRow({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter((child) => !isHiddenRowChild(child));

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 items-stretch gap-0 px-1">
      {items.map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? <ToolOptionSeparator /> : null}
          {child}
        </Fragment>
      ))}
    </div>
  );
}
