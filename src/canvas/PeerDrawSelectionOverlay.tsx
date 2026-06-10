import { drawStrokesGroupBounds } from '../lib/drawShapes';
import { defaultPlayerColor } from '../lib/playerColor';
import { rotatedRectBoxStyleScreen } from '../lib/rotationHandle';
import type { DrawStroke, Point } from '../lib/types';
import { usePeerDrawSelections } from '../hooks/usePeerSelections';
import { useStore } from '../store/useStore';

type Props = {
  strokes: DrawStroke[];
  stagePos: { x: number; y: number };
  viewScale: number;
  gridOffset?: Point;
  /** Read-only local marquee when the edit overlay is not active. */
  showLocalMarquee?: boolean;
};

function DrawSelectionMarquee({
  strokeIds,
  strokes,
  color,
  stagePos,
  viewScale,
  gridOffset,
  keyId,
}: {
  strokeIds: string[];
  strokes: DrawStroke[];
  color: string;
  stagePos: { x: number; y: number };
  viewScale: number;
  gridOffset?: Point;
  keyId: string;
}) {
  const selectedStrokes = strokes.filter((stroke) => strokeIds.includes(stroke.id));
  const bounds = drawStrokesGroupBounds(selectedStrokes, gridOffset);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;

  const boxStyle = rotatedRectBoxStyleScreen(bounds, 0, stagePos, viewScale);
  return (
    <div
      key={keyId}
      className="pointer-events-none absolute z-[14] rounded-sm border-2"
      style={{
        ...boxStyle,
        borderColor: color,
        boxShadow: `0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)`,
      }}
      aria-hidden
    />
  );
}

export function PeerDrawSelectionOverlay({
  strokes,
  stagePos,
  viewScale,
  gridOffset,
  showLocalMarquee = false,
}: Props) {
  const activeSceneId = useStore((s) => s.activeSceneId);
  const selectedDrawStrokeIds = useStore((s) => s.selectedDrawStrokeIds);
  const playerName = useStore((s) => s.playerName);
  const drawHue = useStore((s) => s.drawHue);
  const peerSelections = usePeerDrawSelections(activeSceneId);
  const localColor = defaultPlayerColor(playerName, drawHue ?? 0);

  return (
    <>
      {showLocalMarquee && selectedDrawStrokeIds.length > 0 ? (
        <DrawSelectionMarquee
          keyId="local-draw-selection"
          strokeIds={selectedDrawStrokeIds}
          strokes={strokes}
          color={localColor}
          stagePos={stagePos}
          viewScale={viewScale}
          gridOffset={gridOffset}
        />
      ) : null}
      {peerSelections.map((peer) => (
        <DrawSelectionMarquee
          keyId={peer.peerId}
          strokeIds={peer.selectedDrawStrokeIds}
          strokes={strokes}
          color={peer.sessionColor}
          stagePos={stagePos}
          viewScale={viewScale}
          gridOffset={gridOffset}
        />
      ))}
    </>
  );
}
