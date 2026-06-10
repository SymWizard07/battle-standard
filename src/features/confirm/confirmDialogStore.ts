import { create } from 'zustand';

export type ConfirmTone = 'default' | 'danger';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmState = {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((confirmed: boolean) => void) | null;
  request: (options: ConfirmOptions) => Promise<boolean>;
  finish: (confirmed: boolean) => void;
};

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,
  request: (options) =>
    new Promise((resolve) => {
      set({ open: true, options, resolve });
    }),
  finish: (confirmed) => {
    const { resolve } = get();
    resolve?.(confirmed);
    set({ open: false, options: null, resolve: null });
  },
}));

export function confirmAction(
  messageOrOptions: string | ConfirmOptions,
): Promise<boolean> {
  const options =
    typeof messageOrOptions === 'string'
      ? { message: messageOrOptions }
      : messageOrOptions;
  return useConfirmStore.getState().request({
    title: 'Confirm',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    tone: 'default',
    ...options,
  });
}
