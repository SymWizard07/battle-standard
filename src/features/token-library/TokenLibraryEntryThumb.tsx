import type { TokenLibraryEntry } from '../../lib/types';
import { StyledTokenName } from '../../components/StyledTokenName';
import { plainTokenName } from '../../lib/tokenNameMarkup';
import { useStore } from '../../store/useStore';
import { useDeviceClass } from '../layout/useDeviceClass';
import { useLayoutStore } from '../layout/layoutStore';
import { isTemplateTokenAssetId } from '../../lib/templateTokenImage';
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
  const libraryEntryPickActive = useStore((s) => s.libraryEntryPickActive);
  const submitLibraryEntryPick = useStore((s) => s.submitLibraryEntryPick);
  const device = useDeviceClass();
  const activateModule = useLayoutStore((s) => s.activateModule);

  const pickableForImports =
    entry.kind === 'asset' && !isTemplateTokenAssetId(entry.assetId);
  const pickBlocked = libraryEntryPickActive && !pickableForImports;

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
      draggable={!libraryEntryPickActive}
      onClick={() => {
        if (!libraryEntryPickActive) return;
        submitLibraryEntryPick(entry.id);
        activateModule(device, 'imports');
      }}
      onDragStart={(e) => {
        if (libraryEntryPickActive) {
          e.preventDefault();
          return;
        }
        dragPayload(e);
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`group ${
        pickBlocked
          ? 'cursor-pointer opacity-40 ring-1 ring-transparent hover:ring-amber-500/80'
          : libraryEntryPickActive
            ? 'cursor-pointer ring-1 ring-transparent hover:ring-sky-400'
            : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-40' : ''}`}
      title={
        pickBlocked
          ? 'Template and color tokens can’t be edited in Appearance'
          : plainTokenName(entry.name)
      }
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
