import type Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Group, Layer, Stage } from 'react-konva';
import { computeMapBounds, fitBoundsToRect } from '../lib/sceneBounds';
import { DEFAULT_GRID_OFFSET } from '../lib/fixedGrid';
import { sceneMaps } from '../lib/sceneMaps';
import { useActiveScene, useStore } from '../store/useStore';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { DrawLayer } from './layers/DrawLayer';
import { fogOpsFingerprint } from '../lib/fogMask';
import { FogLayer } from './layers/FogLayer';
import { MeasurementLayer } from './layers/MeasurementLayer';
import { filterMeasurementsForViewer } from '../lib/measureVisibility';
import { defaultPlayerColor } from '../lib/playerColor';
import { TokenLayer } from './layers/TokenLayer';

const PREVIEW_W = 320;
const PREVIEW_H = 180;
const CAPTURE_INTERVAL_MS = 5000;

/** Hidden stage that periodically snapshots the active scene (no grid) for deck thumbnails. */
export function ScenePreviewCapture() {
  const scene = useActiveScene();
  const activeSceneId = useStore((s) => s.activeSceneId);
  const assetUrls = useStore((s) => s.assetUrls);
  const setScenePreviewUrl = useStore((s) => s.setScenePreviewUrl);
  const stageRef = useRef<Konva.Stage>(null);

  const mapBounds = useMemo(() => (scene ? computeMapBounds(scene) : null), [scene]);
  const previewMeasurements = useMemo(
    () =>
      scene
        ? filterMeasurementsForViewer(scene.measurements, 'player', '', true)
        : [],
    [scene],
  );

  const fit = useMemo(
    () =>
      mapBounds
        ? fitBoundsToRect(mapBounds, PREVIEW_W, PREVIEW_H)
        : { x: 0, y: 0, scale: 1 },
    [mapBounds],
  );

  const capture = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !activeSceneId) return;
    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 1 });
      setScenePreviewUrl(activeSceneId, dataUrl);
    } catch {
      // Canvas may be tainted if assets lack CORS; ignore.
    }
  }, [activeSceneId, setScenePreviewUrl]);

  const gridOffset = scene?.gridOffset ?? DEFAULT_GRID_OFFSET;
  const fogKey = scene ? fogOpsFingerprint(scene.fog) : '';

  useEffect(() => {
    if (!scene) return;
    const t = window.setTimeout(capture, 400);
    return () => window.clearTimeout(t);
  }, [scene, fogKey, capture]);

  useEffect(() => {
    if (!scene) return;
    const id = window.setInterval(capture, CAPTURE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [scene, capture]);

  if (!scene || !mapBounds) return null;

  const maps = sceneMaps(scene);

  return (
    <div
      className="pointer-events-none fixed -left-[9999px] top-0 h-0 w-0 overflow-hidden opacity-0"
      aria-hidden
    >
      <Stage ref={stageRef} width={PREVIEW_W} height={PREVIEW_H}>
        <Layer listening={false}>
          <Group x={fit.x} y={fit.y} scaleX={fit.scale} scaleY={fit.scale} listening={false}>
            {maps.map((layer) => (
              <BackgroundLayer
                key={layer.id}
                mapUrl={assetUrls[layer.assetId]}
                mapTransform={layer.transform}
              />
            ))}
            <TokenLayer
              tokens={scene.tokens}
              assetUrls={assetUrls}
              selectedTokenIds={[]}
              sessionSelectionColor="#94a3b8"
              movePreviewPositions={null}
              scalePreviewById={null}
              onTokenTap={() => {}}
              onTokenHover={() => {}}
            />
            <FogLayer
              fog={scene.fog}
              gridOffset={gridOffset}
              scene={scene}
              renderAsPlayer
              fixedFogPattern
              showToolPreview={false}
            />
            <MeasurementLayer
              measurements={previewMeasurements}
              ephemeral={null}
              alternatingDiagonals={false}
              viewScale={1}
              sessionColor={defaultPlayerColor('', 0)}
            />
            <DrawLayer strokes={scene.drawStrokes ?? []} preview={null} />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}
