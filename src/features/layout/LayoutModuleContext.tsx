import { createContext, useContext, type ReactNode } from 'react';
import type { StatusEffectId } from '../../lib/types';
import type { DeviceClass } from './schema/layoutSchema';

export type LayoutRenderMode = 'live' | 'preview';

export type LayoutModuleContext = {
  mode: LayoutRenderMode;
  device: DeviceClass;
  mapWrapRef?: React.RefObject<HTMLDivElement | null>;
  onMapDrop?: (e: React.DragEvent) => void;
  joinFailedMessage?: string | null;
  hoveredTokenEffects?: StatusEffectId[];
  tooltipVisible?: boolean;
};

const LayoutModuleContextInternal = createContext<LayoutModuleContext | null>(null);

export function LayoutModuleProvider({
  value,
  children,
}: {
  value: LayoutModuleContext;
  children: ReactNode;
}) {
  return (
    <LayoutModuleContextInternal.Provider value={value}>
      {children}
    </LayoutModuleContextInternal.Provider>
  );
}

export function useLayoutModuleContext(): LayoutModuleContext {
  const ctx = useContext(LayoutModuleContextInternal);
  if (!ctx) throw new Error('useLayoutModuleContext must be used within LayoutModuleProvider');
  return ctx;
}

export const LAYOUT_MODULE_DRAG_TYPE = 'application/x-battle-standard-module';
