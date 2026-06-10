import { useMemo } from 'react';
import { playerNameInputColors } from '../../lib/playerColor';
import { useStore } from '../../store/useStore';

const sectionLabel =
  'shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500';

type Variant = 'inline' | 'full' | 'embedded';

type Props = {
  className?: string;
  /** inline = compact toolbar chip; full = wide bar; embedded = input only inside a card */
  variant?: Variant;
};

function PlayerNameInput({
  className = '',
  size = 'sm',
}: {
  className?: string;
  size?: 'sm' | 'lg';
}) {
  const playerName = useStore((s) => s.playerName);
  const setPlayerName = useStore((s) => s.setPlayerName);
  const drawHue = useStore((s) => s.drawHue ?? 0);

  const hasName = playerName.trim().length > 0;

  const nameInputColors = useMemo(
    () => (hasName ? playerNameInputColors(playerName, drawHue) : null),
    [hasName, playerName, drawHue],
  );

  const sizeClass =
    size === 'lg'
      ? 'min-h-11 rounded-xl border px-3 text-sm'
      : 'h-8 rounded-md border px-2 text-xs';

  const colorClass = hasName
    ? 'border-2 focus:ring-2 focus:ring-[var(--name-ring)]'
    : 'border-slate-500/50 bg-slate-950/35 focus:border-slate-400 focus:ring-2 focus:ring-slate-500/40';

  return (
    <input
      className={`${sizeClass} ${colorClass} text-slate-100 outline-none ${className}`.trim()}
      style={
        nameInputColors
          ? {
              borderColor: nameInputColors.outlineColor,
              backgroundColor: nameInputColors.backgroundColor,
              ['--name-ring' as string]: nameInputColors.outlineColor,
            }
          : undefined
      }
      value={playerName}
      onChange={(e) => setPlayerName(e.target.value)}
      placeholder="Your name"
      aria-label="Display name"
    />
  );
}

/** Display name field with live player-color preview. */
export function PlayerNameSection({ className = '', variant = 'inline' }: Props) {
  if (variant === 'embedded') {
    return <PlayerNameInput className={`w-full ${className}`.trim()} size="lg" />;
  }

  const sectionClass =
    variant === 'full'
      ? 'flex w-full min-w-0 items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2'
      : 'inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1';

  const inputClass = variant === 'full' ? 'min-w-0 flex-1' : 'w-[8.5rem]';

  return (
    <div className={`${sectionClass} ${className}`.trim()}>
      <span className={sectionLabel}>Name</span>
      <PlayerNameInput className={inputClass} size={variant === 'full' ? 'lg' : 'sm'} />
    </div>
  );
}
