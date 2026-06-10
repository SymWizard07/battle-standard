import { useState } from 'react';
import { CampaignsBackButton } from '../CampaignsBackButton';
import { InfoModal } from '../../settings/InfoModal';
import { useActiveScene, useStore } from '../../../store/useStore';

export function SessionHeaderModule() {
  const campaign = useStore((s) => s.campaign);
  const scene = useActiveScene();

  if (!campaign) return null;

  return (
    <header className="safe-top flex h-full min-h-11 shrink-0 items-center gap-2 border-b border-slate-700 bg-slate-900/95 px-3 py-2">
      <CampaignsBackButton />
      <h1 className="min-w-0 truncate text-sm font-semibold text-slate-100">
        {scene?.name ?? campaign.name}
      </h1>
    </header>
  );
}

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

