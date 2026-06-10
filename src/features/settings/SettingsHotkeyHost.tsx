import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SettingsModal } from './SettingsModal';
import { useSettingsUiStore } from './settingsUiStore';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

function isSettingsHotkey(e: KeyboardEvent): boolean {
  if (e.key === 'F2') return true;
  if (!(e.ctrlKey || e.metaKey)) return false;
  return e.key === ',' || e.code === 'Comma';
}

/** Global settings hotkey + modal host (campaign routes only). */
export function SettingsHotkeyHost() {
  const location = useLocation();
  const onCampaign = /^\/campaign\//.test(location.pathname);
  const settingsOpen = useSettingsUiStore((s) => s.open);
  const setSettingsOpen = useSettingsUiStore((s) => s.setOpen);
  const toggleSettings = useSettingsUiStore((s) => s.toggle);

  useEffect(() => {
    if (!onCampaign) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (!isSettingsHotkey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      toggleSettings();
    };

    window.addEventListener('keydown', onKeyDown, { capture: true, passive: false });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [onCampaign, toggleSettings]);

  if (!onCampaign) return null;

  return <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />;
}
