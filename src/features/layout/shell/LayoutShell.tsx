import type { RefObject } from 'react';
import type { StatusEffectId } from '../../../lib/types';
import { LayoutModuleProvider, type LayoutModuleContext } from '../LayoutModuleContext';
import { LayoutNodeRenderer } from './LayoutNodeRenderer';
import { useDeviceClass } from '../useDeviceClass';
import { useLayoutStore } from '../layoutStore';
import type { LayoutNode } from '../schema/layoutSchema';

export type LayoutShellProps = {
  mapWrapRef: RefObject<HTMLDivElement | null>;
  onMapDrop: (e: React.DragEvent) => void;
  joinFailedMessage: string | null;
  hoveredTokenEffects?: StatusEffectId[];
  tooltipVisible?: boolean;
};

export function LayoutShell({
  mapWrapRef,
  onMapDrop,
  joinFailedMessage,
  hoveredTokenEffects,
  tooltipVisible,
}: LayoutShellProps) {
  const device = useDeviceClass();
  const layoutProfiles = useLayoutStore((s) => s.layoutProfiles);
  const layoutMountKey = useLayoutStore((s) => s.layoutMountKey);
  const updateSplitSizes = useLayoutStore((s) => s.updateSplitSizes);
  const setTabsActive = useLayoutStore((s) => s.setTabsActive);
  const moveTab = useLayoutStore((s) => s.moveTab);

  const tree: LayoutNode = layoutProfiles[device];

  const moduleContext: LayoutModuleContext = {
    mode: 'live',
    device,
    mapWrapRef,
    onMapDrop,
    joinFailedMessage,
    hoveredTokenEffects,
    tooltipVisible,
  };

  return (
    <LayoutModuleProvider value={moduleContext}>
      <div
        data-app-layout-surface
        className="flex h-full min-h-0 w-full flex-row overflow-hidden"
      >
        <LayoutNodeRenderer
          key={`${device}-${layoutMountKey}`}
          node={tree}
          mode="live"
          device={device}
          onSplitResize={(path, sizes) => updateSplitSizes(device, path, sizes)}
          onTabSelect={(path, tabId) => setTabsActive(device, path, tabId)}
          onTabMove={(fromPath, tabId, toPath) => moveTab(device, fromPath, tabId, toPath)}
        />
      </div>
    </LayoutModuleProvider>
  );
}
