import { useEffect, useRef, useState } from 'react';
import { useLayoutStore } from '../layout/layoutStore';
import { DiceSettingsPanel } from './DiceSettingsPanel';
import { LayoutEditor } from './LayoutEditor';
import {
  SETTINGS_TABS,
  useSettingsUiStore,
  type SettingsTabId,
} from './settingsUiStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const beginLayoutEdit = useLayoutStore((s) => s.beginLayoutEdit);
  const cancelEditorDraft = useLayoutStore((s) => s.cancelEditorDraft);
  const editorDevice = useLayoutStore((s) => s.editorDevice);
  const activeTab = useSettingsUiStore((s) => s.activeTab);
  const setActiveTab = useSettingsUiStore((s) => s.setActiveTab);
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
    if (activeTab !== 'layout') return;
    if (beganEditForOpenRef.current) return;
    beganEditForOpenRef.current = true;
    beginLayoutEdit(editorDevice);
  }, [open, activeTab, beginLayoutEdit, cancelEditorDraft, editorDevice]);

  const selectTab = (tab: SettingsTabId) => {
    if (tab === activeTab) return;
    if (layoutDragging) return;
    setActiveTab(tab);
  };

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
        <header className="flex shrink-0 flex-col border-b border-slate-700">
          <div className="flex items-center justify-between px-4 py-3">
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
          </div>
          <div
            className="flex w-full border-t border-slate-700/80 bg-slate-900/95"
            role="tablist"
            aria-label="Settings sections"
          >
            {SETTINGS_TABS.map((tab) => {
              const selected = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`settings-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls={`settings-panel-${tab.id}`}
                  className={`flex min-h-9 min-w-0 flex-1 items-center justify-center border-b-2 px-3 text-sm font-medium transition-colors ${
                    selected
                      ? 'border-sky-500 text-sky-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => selectTab(tab.id)}
                >
                  {tab.title}
                </button>
              );
            })}
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
          {activeTab === 'layout' ? (
            <div
              id="settings-panel-layout"
              role="tabpanel"
              aria-labelledby="settings-tab-layout"
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <LayoutEditor onDragActivityChange={setLayoutDragging} />
            </div>
          ) : (
            <div
              id="settings-panel-dice"
              role="tabpanel"
              aria-labelledby="settings-tab-dice"
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <DiceSettingsPanel />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
