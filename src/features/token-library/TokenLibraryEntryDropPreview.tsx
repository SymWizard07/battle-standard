import type { TokenLibraryEntry } from '../../lib/types';
import { StyledTokenName } from '../../components/StyledTokenName';
import { TemplateTokenThumb } from './TemplateTokenThumb';

interface Props {
  entry: TokenLibraryEntry;
  assetUrl?: string;
}

export function TokenLibraryEntryDropPreview({ entry, assetUrl }: Props) {
  return (
    <div className="pointer-events-none" aria-hidden>
      <div className="relative aspect-square overflow-hidden rounded-lg border-2 border-dashed border-sky-400/80 bg-sky-950/30 ring-2 ring-sky-500/30">
        {entry.kind === 'asset' ? (
          assetUrl ? (
            <img
              src={assetUrl}
              alt=""
              className="h-full w-full object-cover opacity-70"
              draggable={false}
            />
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-slate-500 opacity-70">
              …
            </span>
          )
        ) : entry.kind === 'color' ? (
          <div className="h-full w-full opacity-70" style={{ backgroundColor: entry.color }} />
        ) : (
          <TemplateTokenThumb templateColor={entry.templateColor} className="h-full w-full opacity-70" />
        )}
        <div className="absolute inset-0 bg-sky-400/10" />
      </div>
      <StyledTokenName
        value={entry.name}
        className="mt-1 block truncate text-center text-[10px] leading-tight text-sky-300/90"
      />
    </div>
  );
}
