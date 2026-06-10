import { useState } from 'react';
import { useStore } from '../../store/useStore';

interface Props {
  active: boolean;
  onDropMapToken: () => void;
  onDropLibraryEntry: (entryId: string) => void;
}

export function TokenLibraryDeleteZone({
  active,
  onDropMapToken,
  onDropLibraryEntry,
}: Props) {
  const [highlight, setHighlight] = useState(false);
  const interactionMode = useStore((s) => s.interactionMode);
  const setTokenLibraryDropOverDelete = useStore((s) => s.setTokenLibraryDropOverDelete);
  const setTokenLibraryDropTargetGroupId = useStore((s) => s.setTokenLibraryDropTargetGroupId);
  const mapTokenDrag = interactionMode === 'moving';

  if (!active) return null;

  return (
    <div
      data-token-library-delete-zone=""
      className={`shrink-0 border-t border-slate-700 px-3 py-2 transition-colors ${
        highlight ? 'bg-red-950/40' : 'bg-slate-900'
      } ${mapTokenDrag && highlight ? 'cursor-not-allowed' : mapTokenDrag ? 'cursor-grabbing' : ''}`}
      onPointerEnter={() => {
        setHighlight(true);
        if (mapTokenDrag) {
          setTokenLibraryDropOverDelete(true);
          setTokenLibraryDropTargetGroupId(null);
        }
      }}
      onPointerLeave={() => {
        setHighlight(false);
        if (mapTokenDrag) setTokenLibraryDropOverDelete(false);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onDropMapToken();
        setHighlight(false);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setHighlight(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setHighlight(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setHighlight(true);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setHighlight(false);
        const entryId = e.dataTransfer.getData('token-library-entry-id');
        if (entryId) {
          onDropLibraryEntry(entryId);
          return;
        }
        onDropMapToken();
      }}
    >
      <div
        className={`flex min-h-11 items-center justify-center rounded-lg border-2 border-dashed px-3 text-center text-xs transition-colors ${
          highlight
            ? 'border-red-400/80 bg-red-950/30 text-red-200'
            : 'border-slate-600 text-slate-400'
        }`}
      >
        Drop here to delete
      </div>
    </div>
  );
}
