import { useRef, useState, type ReactElement } from 'react';

const SHOW_DELAY_MS = 200;

type Props = {
  label: string;
  children: ReactElement;
};

export function FastTooltip({ label, children }: Props) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-100 shadow-lg"
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
