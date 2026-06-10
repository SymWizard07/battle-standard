import type { TokenLibraryDropPayload } from '../../lib/types';
import { StyledTokenName } from '../../components/StyledTokenName';

interface Props {
  payloads: TokenLibraryDropPayload[];
  assetUrls: Record<string, string>;
}

function PreviewThumb({
  payload,
  assetUrl,
}: {
  payload: TokenLibraryDropPayload;
  assetUrl?: string;
}) {
  return (
    <div className="pointer-events-none" aria-hidden>
      <div className="relative aspect-square overflow-hidden rounded-lg border-2 border-dashed border-sky-400/80 bg-sky-950/30 ring-2 ring-sky-500/30">
        {payload.imageAssetId && assetUrl ? (
          <img
            src={assetUrl}
            alt=""
            className="h-full w-full object-cover opacity-70"
            draggable={false}
          />
        ) : (
          <div
            className="h-full w-full opacity-70"
            style={{ backgroundColor: payload.color }}
          />
        )}
        <div className="absolute inset-0 bg-sky-400/10" />
      </div>
      <StyledTokenName
        value={payload.name}
        className="mt-1 block truncate text-center text-[10px] leading-tight text-sky-300/90"
      />
    </div>
  );
}

export function TokenLibraryMapDropPreview({ payloads, assetUrls }: Props) {
  if (payloads.length === 0) return null;
  return (
    <>
      {payloads.map((payload) => (
        <PreviewThumb
          key={payload.tokenId}
          payload={payload}
          assetUrl={payload.imageAssetId ? assetUrls[payload.imageAssetId] : undefined}
        />
      ))}
    </>
  );
}
