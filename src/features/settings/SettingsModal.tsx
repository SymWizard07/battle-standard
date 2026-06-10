import { useEffect, useRef, useState } from 'react';
import { useLayoutStore } from '../layout/layoutStore';
import { LayoutEditor } from './LayoutEditor';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const beginLayoutEdit = useLayoutStore((s) => s.beginLayoutEdit);
  const cancelEditorDraft = useLayoutStore((s) => s.cancelEditorDraft);
  const editorDevice = useLayoutStore((s) => s.editorDevice);
  const [layoutDragging, setLayoutDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const beganEditForOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      beganEditForOpenRef.current = false;
      cancelEditorDraft();
      setLayoutDragging(false);
      return;
    }
    if (beganEditForOpenRef.current) return;
    beganEditForOpenRef.current = true;
    beginLayoutEdit(editorDevice);
  }, [open, beginLayoutEdit, cancelEditorDraft, editorDevice]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] bg-black/60"
        aria-label="Close settings"
        onClick={() => {
          if (layoutDragging) return;
          onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="fixed inset-2 z-[90] flex flex-col overflow-hidden rounded-xl border border-slate-600/80 bg-slate-900/75 shadow-2xl backdrop-blur-md sm:inset-3"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 id="settings-title" className="text-base font-semibold text-slate-100">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close settings"
          >
            ✕
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
          <LayoutEditor onDragActivityChange={setLayoutDragging} />
        </div>
      </div>
    </>
  );
}
