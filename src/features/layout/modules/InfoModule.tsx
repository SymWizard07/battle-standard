import { useState } from 'react';
import { InfoModal } from '../../settings/InfoModal';

export function InfoModule() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-full flex-col bg-slate-900 p-3">
      <p className="mb-3 text-sm text-slate-400">
        Open the full help guide for Battle Standard controls and tips.
      </p>
      <button
        type="button"
        className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-500"
        onClick={() => setOpen(true)}
      >
        Open help
      </button>
      <InfoModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
