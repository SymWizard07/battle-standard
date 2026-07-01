import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type LayoutPreviewSnapContextValue = {
  sizeMatchedPanelIds: ReadonlySet<string>;
  setSizeMatchedPanelIds: (ids: string[]) => void;
};

const LayoutPreviewSnapContext = createContext<LayoutPreviewSnapContextValue>({
  sizeMatchedPanelIds: new Set(),
  setSizeMatchedPanelIds: () => {},
});

export function LayoutPreviewSnapProvider({ children }: { children: ReactNode }) {
  const [sizeMatchedPanelIds, setIds] = useState<string[]>([]);
  const value = useMemo(
    () => ({
      sizeMatchedPanelIds: new Set(sizeMatchedPanelIds),
      setSizeMatchedPanelIds: setIds,
    }),
    [sizeMatchedPanelIds],
  );
  return (
    <LayoutPreviewSnapContext.Provider value={value}>{children}</LayoutPreviewSnapContext.Provider>
  );
}

export function useLayoutPreviewSnap(): LayoutPreviewSnapContextValue {
  return useContext(LayoutPreviewSnapContext);
}
