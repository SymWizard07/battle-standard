import type { ReactNode } from 'react';
import type { ActionMessage, NoticeTone } from './saveHelperCopy';

const toneStyles: Record<NoticeTone, string> = {
  success:
    'border-emerald-500/35 bg-emerald-950/25 text-emerald-50',
  warning:
    'border-amber-500/40 bg-amber-950/30 text-amber-50',
  info:
    'border-sky-500/35 bg-sky-950/25 text-sky-50',
  muted:
    'border-slate-500/40 bg-slate-950/30 text-slate-200',
  error:
    'border-red-500/40 bg-red-950/30 text-red-50',
};

const toneIcons: Record<NoticeTone, string> = {
  success: '✓',
  warning: '!',
  info: 'i',
  muted: '○',
  error: '×',
};

const toneText: Record<ActionMessage['tone'], string> = {
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  info: 'text-sky-400',
  muted: 'text-slate-400',
  error: 'text-red-400',
};

type Props = {
  tone: NoticeTone;
  title: string;
  children?: ReactNode;
  steps?: string[];
  detail?: string;
  detailLabel?: string;
};

export function InlineActionStatus({ message }: { message: ActionMessage }) {
  return (
    <span className={`min-w-0 flex-1 text-sm leading-snug ${toneText[message.tone]}`} role="status">
      {message.title}
      {message.detail && (
        <span className="ml-1 text-xs opacity-70" title={message.detail}>
          ⓘ
        </span>
      )}
    </span>
  );
}

export function StorageNotice({
  tone,
  title,
  children,
  steps,
  detail,
  detailLabel = 'Technical details',
}: Props) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${toneStyles[tone]}`}>
      <div className="flex gap-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/20 text-xs font-bold"
          aria-hidden
        >
          {toneIcons[tone]}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium leading-snug">{title}</p>
          {children && <div className="text-[0.925rem] leading-relaxed opacity-90">{children}</div>}
          {steps && steps.length > 0 && (
            <ol className="list-decimal space-y-1 pl-4 text-[0.925rem] leading-relaxed opacity-90">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
          {detail && (
            <details className="group">
              <summary className="cursor-pointer text-xs opacity-70 hover:opacity-100">
                {detailLabel}
              </summary>
              <p className="mt-1.5 break-all font-mono text-[0.7rem] leading-relaxed opacity-75">
                {detail}
              </p>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
