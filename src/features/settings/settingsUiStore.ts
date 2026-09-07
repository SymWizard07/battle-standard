import { create } from 'zustand';

export const SETTINGS_TABS = [
  { id: 'layout', title: 'Layout' },
  { id: 'dice', title: 'Dice' },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

interface SettingsUiState {
  open: boolean;
  activeTab: SettingsTabId;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setActiveTab: (tab: SettingsTabId) => void;
}

export const useSettingsUiStore = create<SettingsUiState>((set) => ({
  open: false,
  activeTab: 'layout',
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
