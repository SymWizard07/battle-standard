import { MapViewport } from '../../../canvas/MapViewport';
import { ContextPanel } from '../../context/ContextPanel';
import { StatusTooltip } from '../../context/StatusTooltip';
import { CanvasHomeButton } from '../CanvasHomeButton';
import { CanvasHistoryButtons } from '../CanvasHistoryButtons';
import { useLayoutModuleContext } from '../LayoutModuleContext';

export function CanvasModule() {
  const ctx = useLayoutModuleContext();
  const {
    mode,
    mapWrapRef,
    onMapDrop,
    joinFailedMessage,
    hoveredTokenEffects = [],
    tooltipVisible = false,
  } = ctx;

  if (mode === 'preview') {
    return (
      <div className="flex h-full min-h-0 items-center justify-center border border-dashed border-slate-600 bg-slate-950">
        <span className="text-sm font-medium text-slate-500">Play area</span>
      </div>
    );
  }

  if (!mapWrapRef || !onMapDrop) return null;

  return (
    <main
      ref={mapWrapRef}
      className="relative h-full min-h-0 w-full"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onMapDrop}
    >
      {joinFailedMessage && (
        <div className="absolute left-1/2 top-3 z-20 max-w-md -translate-x-1/2 rounded-xl border border-red-500/40 bg-red-950/90 px-4 py-2 text-center text-sm text-red-200 shadow-lg">
          {joinFailedMessage}
        </div>
      )}
      <CanvasHomeButton />
      <CanvasHistoryButtons />
      <MapViewport />
      <ContextPanel />
      {tooltipVisible && hoveredTokenEffects.length > 0 && (
        <StatusTooltip x={0} y={0} effects={hoveredTokenEffects} visible />
      )}
    </main>
  );
}
