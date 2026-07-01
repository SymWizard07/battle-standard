import { useState } from 'react';
import { APP_TITLE } from '../../../hooks/useDocumentTitle';
import { seesAsPlayer, useStore } from '../../../store/useStore';
import { CampaignsBackButton } from '../CampaignsBackButton';
import { useLayoutModuleContext } from '../LayoutModuleContext';
import { sharedEdgesBorderClass, useModulePanelEdges } from '../ModulePanelContext';
import { InfoModal } from '../../settings/InfoModal';
import { useSettingsUiStore } from '../../settings/settingsUiStore';
import { InfoIcon, SettingsIcon } from '../../settings/SettingsIcons';

export function SettingsModule() {
  const { device } = useLayoutModuleContext();
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const asPlayer = seesAsPlayer(role, playerView);
  const setSettingsOpen = useSettingsUiStore((s) => s.setOpen);
  const [infoOpen, setInfoOpen] = useState(false);
  const compact = device !== 'desktop';
  const sharedEdges = useModulePanelEdges();
  const edgeBorder = sharedEdgesBorderClass(sharedEdges);

  if (asPlayer) {
    return (
      <div className={`safe-bottom flex h-full items-center bg-slate-900 p-2 ${edgeBorder}`}>
        <div className="flex w-full gap-2">
          <CampaignsBackButton className="min-h-11 min-w-11 bg-slate-800 hover:border-slate-600" />
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-750"
            aria-label={`How to use ${APP_TITLE}`}
          >
            <InfoIcon />
          </button>
        </div>
        <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      </div>
    );
  }

  return (
    <div className={`safe-bottom flex h-full items-center bg-slate-900 p-2 md:p-3 ${edgeBorder}`}>
      <div className="flex w-full gap-2">
        <CampaignsBackButton className="min-h-11 min-w-11 bg-slate-800 hover:border-slate-600" />
        {compact ? (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings (Ctrl+,)"
            className="flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-750"
            aria-label="Settings"
          >
            <SettingsIcon />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Settings (Ctrl+,)"
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 text-sm font-medium text-slate-200 hover:bg-slate-750"
          >
            <SettingsIcon />
            Settings
          </button>
        )}
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-750"
          aria-label={`How to use ${APP_TITLE}`}
        >
          <InfoIcon />
        </button>
      </div>
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
