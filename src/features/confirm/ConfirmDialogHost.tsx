import { useEffect } from 'react';
import { useConfirmStore } from './confirmDialogStore';

export function ConfirmDialogHost() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const finish = useConfirmStore((s) => s.finish);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, finish]);

  if (!open || !options) return null;

  const {
    title = 'Confirm',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'default',
  } = options;

  const confirmClass =
    tone === 'danger'
      ? 'bg-red-700 text-white hover:bg-red-600'
      : 'bg-sky-600 text-white hover:bg-sky-500';

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[100] bg-black/60"
        aria-label="Cancel"
        onClick={() => finish(false)}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="fixed left-1/2 top-1/2 z-[110] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl"
      >
        <div className="border-b border-slate-700 px-4 py-3">
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-100">
            {title}
          </h2>
        </div>
        <p id="confirm-dialog-message" className="px-4 py-4 text-sm leading-relaxed text-slate-300">
          {message}
        </p>
        <div className="flex justify-end gap-2 border-t border-slate-700 px-4 py-3">
          <button
            type="button"
            onClick={() => finish(false)}
            className="min-h-10 rounded-lg bg-slate-800 px-4 text-sm text-slate-200 hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => finish(true)}
            className={`min-h-10 rounded-lg px-4 text-sm font-medium ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
