import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfirmDialogHost } from '../features/confirm/ConfirmDialogHost';
import { SettingsHotkeyHost } from '../features/settings/SettingsHotkeyHost';
import { CampaignPage } from './CampaignPage';
import { HomePage } from './HomePage';

export function App() {
  return (
    <HashRouter>
      <SettingsHotkeyHost />
      <ConfirmDialogHost />
      <div className="flex h-full min-h-0 flex-col">
        <div className="relative min-h-0 flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/campaign/:campaignId" element={<CampaignPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}
