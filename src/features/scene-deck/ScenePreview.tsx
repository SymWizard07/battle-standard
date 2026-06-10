interface Props {
  previewUrl?: string;
  className?: string;
  compact?: boolean;
}

/** Thumbnail from periodic canvas capture (map, tokens, fog, etc.; no grid). */
export function ScenePreview({ previewUrl, className = '', compact = false }: Props) {
  return (
    <div
      className={`relative w-full overflow-hidden bg-slate-800 ${
        compact ? 'aspect-video rounded-sm' : 'aspect-video rounded-lg'
      } ${className}`}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt=""
          className="h-full w-full object-contain object-center"
          draggable={false}
        />
      ) : (
        <div
          className={`flex h-full items-center justify-center text-slate-500 ${
            compact ? 'text-[8px]' : 'text-xs'
          }`}
        >
          …
        </div>
      )}
    </div>
  );
}
