import type { TokenLibraryEntry } from '../../lib/types';
import { StyledTokenName } from '../../components/StyledTokenName';
import { plainTokenName } from '../../lib/tokenNameMarkup';
import { TemplateTokenThumb } from './TemplateTokenThumb';

interface Props {
  entry: TokenLibraryEntry;
  assetUrl?: string;
  isDragging?: boolean;
  onDelete?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function TokenLibraryEntryThumb({
  entry,
  assetUrl,
  isDragging = false,
  onDelete,
  onDragStart,
  onDragEnd,
}: Props) {
  const dragPayload = (e: React.DragEvent) => {
    e.dataTransfer.setData('token-library-entry-id', entry.id);
    e.dataTransfer.effectAllowed = 'move';
    if (entry.kind === 'asset') {
      e.dataTransfer.setData('token-asset-id', entry.assetId);
      e.dataTransfer.setData('token-name', entry.name);
    } else if (entry.kind === 'color') {
      e.dataTransfer.setData('token-color', entry.color);
      e.dataTransfer.setData('token-name', entry.name);
      e.dataTransfer.setData('token-footprint', JSON.stringify(entry.footprint));
    } else {
      e.dataTransfer.setData('token-template-color', entry.templateColor);
      e.dataTransfer.setData('token-name', entry.name);
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        dragPayload(e);
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`group cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
      title={plainTokenName(entry.name)}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-600 bg-slate-800">
        {entry.kind === 'asset' ? (
          assetUrl ? (
            <img src={assetUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-slate-500">…</span>
          )
        ) : entry.kind === 'color' ? (
          <div className="h-full w-full" style={{ backgroundColor: entry.color }} />
        ) : (
          <TemplateTokenThumb templateColor={entry.templateColor} className="h-full w-full" />
        )}
        {onDelete && (
          <span className="absolute bottom-1 right-1">
            <button
              type="button"
              className="hidden min-h-9 min-w-9 items-center justify-center rounded-lg bg-black/60 text-white group-hover:flex"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete token"
              title="Delete"
            >
              🗑
            </button>
          </span>
        )}
      </div>
      <StyledTokenName
        value={entry.name}
        className="mt-1 block truncate text-center text-[10px] leading-tight"
      />
    </div>
  );
}
