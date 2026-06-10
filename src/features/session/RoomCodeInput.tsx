import { useId, useRef, useState } from 'react';
import { normalizeRoomCode, ROOM_CODE_LENGTH } from '../../lib/ids';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  disabled?: boolean;
  'aria-label'?: string;
};

export function RoomCodeInput({
  value,
  onChange,
  onEnter,
  disabled = false,
  'aria-label': ariaLabel = 'Room code',
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const slots = Array.from({ length: ROOM_CODE_LENGTH }, (_, index) => value[index] ?? '');

  return (
    <div
      className={`relative flex min-h-11 w-full min-w-0 items-center rounded-xl border border-slate-500/50 bg-slate-950/35 px-3 backdrop-blur-md ${
        disabled ? 'opacity-40' : 'cursor-text'
      }`}
      onClick={() => {
        if (!disabled) inputRef.current?.focus();
      }}
    >
      <span
        className="pointer-events-none shrink-0 pr-2 font-mono text-sm tracking-[0.2em] text-slate-500"
        aria-hidden
      >
        #
      </span>

      <div className="pointer-events-none flex min-w-0 flex-1 items-end gap-1.5 py-2.5" aria-hidden>
        {slots.map((char, index) => {
          const isActive = focused && index === value.length && value.length < ROOM_CODE_LENGTH;

          return (
            <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className="min-h-[1.125rem] font-mono text-sm uppercase leading-none tracking-[0.2em] text-slate-100">
                {char}
              </span>
              <span
                className={`h-0.5 w-full rounded-full ${
                  isActive ? 'bg-slate-200' : char ? 'bg-slate-500' : 'bg-slate-600/80'
                }`}
              />
            </div>
          );
        })}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        disabled={disabled}
        aria-label={ariaLabel}
        value={value}
        maxLength={ROOM_CODE_LENGTH}
        className="absolute inset-0 cursor-text opacity-0"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(normalizeRoomCode(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
      />
    </div>
  );
}
