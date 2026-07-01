import type { ReactNode } from 'react';
import { useMemo, useRef } from 'react';
import type { DrawToolShape, MeasureKind } from '../../lib/types';
import { newId } from '../../lib/ids';
import { saveAsset } from '../../lib/db';
import { scheduleStableMirror } from '../../lib/stableStorage';
import {
  autoSizeMapScaleToGrid,
  loadImageDimensions,
  mapTransformAlignedToGridCorner,
} from '../../lib/mapAlign';
import { confirmAction } from '../confirm/confirmDialogStore';
import { SessionPanelContent } from '../session/SessionPanelContent';
import { useActiveScene, seesAsPlayer, useStore } from '../../store/useStore';
import { DEFAULT_GRID_OFFSET } from '../../lib/fixedGrid';
import { DrawOutlineSlider } from './DrawOutlineSlider';
import { referenceMapLayer } from '../../lib/sceneMaps';
import { MapOptionIcon } from './MapOptionIcon';
import {
  FogClearIcon,
  FogEyeIcon,
  FogFullIcon,
  FogMinusIcon,
  FogPlusIcon,
} from './FogActionIcons';
import {
  DRAW_SHAPE_ORDER,
  FOG_SHAPE_ORDER,
  MEASURE_KIND_ORDER,
  type FogShapeId,
} from './toolShapeShortcuts';
import { DrawHuePicker } from './DrawHuePicker';
import { measurementsOwnedBySessionUser } from '../../lib/measureOwnership';
import {
  ToolOptionButton,
  ToolOptionGroup,
  ToolOptionPanelRow,
  ToolOptionSegmentedControl,
  ToolOptionShortcutBadge,
  ToolOptionStandalone,
  ToolOptionToggle,
} from './ToolOptionLayout';

interface ShapeOption {
  id: string;
  label: string;
  icon?: string;
  digit: number;
}

function ShapeOptionButton({
  shape,
  selected,
  onSelect,
  icon,
  showShortcut = false,
}: {
  shape: ShapeOption;
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  showShortcut?: boolean;
}) {
  return (
    <ToolOptionToggle
      label={shape.label}
      active={selected}
      onClick={onSelect}
      title={`${shape.label} (${shape.digit})`}
      tone="amber"
    >
      {showShortcut ? (
        <span className="flex flex-col items-center gap-0.5">
          <ToolOptionShortcutBadge label={shape.digit} />
          {icon}
        </span>
      ) : (
        icon
      )}
    </ToolOptionToggle>
  );
}

const MEASURE_META: Record<MeasureKind, { label: string; icon: string }> = {
  line: { label: 'Line', icon: '/icons/measures/ruler.png' },
  cone: { label: 'Cone', icon: '/icons/measures/cone.png' },
  cube: { label: 'Cube', icon: '/icons/measures/cube.png' },
  sphere: { label: 'Sphere', icon: '/icons/measures/sphere.png' },
};

const FOG_SHAPE_META: Record<FogShapeId, { label: string; icon: string }> = {
  stroke: { label: 'Stroke', icon: '/icons/fog/spline.png' },
  rect: { label: 'Rect', icon: '/icons/fog/rect.png' },
  cone: { label: 'Cone', icon: '/icons/measures/cone.png' },
  sphere: { label: 'Sphere', icon: '/icons/measures/sphere.png' },
};

const MEASURES = MEASURE_KIND_ORDER.map((id, i) => ({
  id,
  ...MEASURE_META[id],
  digit: i + 1,
}));

const FOG_SHAPES = FOG_SHAPE_ORDER.map((id, i) => ({
  id,
  ...FOG_SHAPE_META[id],
  digit: i + 1,
}));

const DRAW_SHAPE_META: Record<
  DrawToolShape,
  { label: string; icon?: string; inlineIcon?: 'erase' }
> = {
  stroke: { label: 'Stroke', icon: '/icons/fog/spline.png' },
  line: { label: 'Line', icon: '/icons/measures/ruler.png' },
  cone: { label: 'Cone', icon: '/icons/measures/cone.png' },
  rect: { label: 'Rect', icon: '/icons/fog/rect.png' },
  sphere: { label: 'Circle', icon: '/icons/measures/sphere.png' },
  erase: { label: 'Erase', inlineIcon: 'erase' },
};

const base = import.meta.env.BASE_URL;

function DrawShapeIcon({ shape }: { shape: DrawToolShape }) {
  const meta = DRAW_SHAPE_META[shape];
  if (meta.inlineIcon === 'erase') {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden
      >
        <circle cx="12" cy="12" r="7" />
        <path d="M8 8l8 8" strokeLinecap="round" />
      </svg>
    );
  }
  return <img src={`${base}${meta.icon!.replace(/^\//, '')}`} alt="" className="h-5 w-5" />;
}

const DRAW_SHAPES = DRAW_SHAPE_ORDER.map((id, i) => ({
  id,
  ...DRAW_SHAPE_META[id],
  digit: i + 1,
}));

function HiddenMapUploadInput({
  fileRef,
  onUpload,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (file: File) => void;
}) {
  return (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onUpload(f);
        e.target.value = '';
      }}
    />
  );
}

export function ToolOptionsPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const scene = useActiveScene();
  const campaign = useStore((s) => s.campaign);
  const activeSceneId = useStore((s) => s.activeSceneId);
  const activeTool = useStore((s) => s.activeTool);
  const sceneEditMode = useStore((s) => s.sceneEditMode);
  const setSceneEditMode = useStore((s) => s.setSceneEditMode);
  const role = useStore((s) => s.role);
  const playerName = useStore((s) => s.playerName);
  const playerView = useStore((s) => s.playerView);
  const fogOpaquePreview = useStore((s) => s.fogOpaquePreview);
  const setFogOpaquePreview = useStore((s) => s.setFogOpaquePreview);
  const asPlayer = seesAsPlayer(role, playerView);
  const addMapLayer = useStore((s) => s.addMapLayer);
  const selectedMapLayerId = useStore((s) => s.selectedMapLayerId);
  const updateMapLayerTransform = useStore((s) => s.updateMapLayerTransform);
  const setMapLayerImageSize = useStore((s) => s.setMapLayerImageSize);
  const registerAssetUrl = useStore((s) => s.registerAssetUrl);
  const gridVisible = useStore((s) => s.gridVisible);
  const setGridVisible = useStore((s) => s.setGridVisible);
  const fogMode = useStore((s) => s.fogMode);
  const setFogMode = useStore((s) => s.setFogMode);
  const fogShape = useStore((s) => s.fogShape);
  const setFogShape = useStore((s) => s.setFogShape);
  const revealAllFog = useStore((s) => s.revealAllFog);
  const setFogDefaultHidden = useStore((s) => s.setFogDefaultHidden);
  const measureKind = useStore((s) => s.measureKind);
  const setMeasureKind = useStore((s) => s.setMeasureKind);
  const measurePinMode = useStore((s) => s.measurePinMode);
  const setMeasurePinMode = useStore((s) => s.setMeasurePinMode);
  const drawShape = useStore((s) => s.drawShape);
  const setDrawShape = useStore((s) => s.setDrawShape);
  const drawHue = useStore((s) => s.drawHue ?? 0);
  const setDrawHue = useStore((s) => s.setDrawHue);
  const drawStrokeWidth = useStore((s) => s.drawStrokeWidth);
  const setDrawStrokeWidth = useStore((s) => s.setDrawStrokeWidth);
  const alternatingDiagonals = useStore((s) => s.alternatingDiagonals);
  const setAlternatingDiagonals = useStore((s) => s.setAlternatingDiagonals);
  const measureDisplayStyle = useStore((s) => s.measureDisplayStyle);
  const setMeasureDisplayStyle = useStore((s) => s.setMeasureDisplayStyle);
  const measureDebugDualView = useStore((s) => s.measureDebugDualView);
  const setMeasureDebugDualView = useStore((s) => s.setMeasureDebugDualView);
  const fadeAndRemoveMeasurementsForCurrentUser = useStore(
    (s) => s.fadeAndRemoveMeasurementsForCurrentUser,
  );
  const selectDrawShapes = useStore((s) => s.selectDrawShapes);
  const setSelectDrawShapes = useStore((s) => s.setSelectDrawShapes);
  const selectedTokenIds = useStore((s) => s.selectedTokenIds);
  const selectedDrawStrokeIds = useStore((s) => s.selectedDrawStrokeIds);
  const selectedMeasurementId = useStore((s) => s.selectedMeasurementId);
  const duplicateSelection = useStore((s) => s.duplicateSelection);
  const deleteSelection = useStore((s) => s.deleteSelection);
  const assetUrls = useStore((s) => s.assetUrls);

  const handleUpload = async (file: File) => {
    if (!campaign || !activeSceneId) return;
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const maxDim = 4096;
    if (width > maxDim || height > maxDim) {
      const s = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * s);
      height = Math.round(height * s);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/jpeg', 0.85),
    );
    const assetId = newId();
    await saveAsset({
      id: assetId,
      campaignId: campaign.id,
      blob,
      mimeType: 'image/jpeg',
      name: file.name,
      createdAt: Date.now(),
      kind: 'map',
    });
    registerAssetUrl(assetId, URL.createObjectURL(blob));
    scheduleStableMirror(campaign.id);
    addMapLayer(activeSceneId, assetId, { width, height });
  };

  const ownedMeasurementCount = useMemo(
    () =>
      scene
        ? measurementsOwnedBySessionUser(scene.measurements, role, playerName).length
        : 0,
    [scene, role, playerName],
  );

  if (!scene || !activeSceneId) return null;

  if (activeTool === 'players') {
    return (
      <div className="flex h-full w-full min-w-0 items-stretch px-1">
        <SessionPanelContent />
      </div>
    );
  }

  if (activeTool === 'pan') {
    return null;
  }

  if (activeTool === 'select') {
    const canActOnSelection =
      selectedTokenIds.length > 0 ||
      (selectDrawShapes && selectedDrawStrokeIds.length > 0) ||
      selectedMeasurementId != null;

    return (
      <ToolOptionPanelRow>
        <ToolOptionStandalone>
          <ToolOptionToggle
            label="Select Drawn Shapes"
            active={selectDrawShapes}
            onClick={() => setSelectDrawShapes(!selectDrawShapes)}
            title="Click or marquee-select lines and shapes drawn on the map"
          />
        </ToolOptionStandalone>
        <ToolOptionGroup title="Controls">
          <ToolOptionButton
            label="Copy"
            disabled={!canActOnSelection}
            onClick={() => {
              if (activeSceneId) duplicateSelection(activeSceneId);
            }}
            title="Duplicate selection (Shift+D)"
          />
          <ToolOptionButton
            label="Delete"
            disabled={!canActOnSelection}
            onClick={() => {
              if (activeSceneId) deleteSelection(activeSceneId);
            }}
            title="Delete selection"
            className="border-red-900/60 text-red-200 hover:border-red-800 hover:bg-red-900/50"
          />
        </ToolOptionGroup>
      </ToolOptionPanelRow>
    );
  }

  if (activeTool === 'sceneEdit' && !asPlayer) {
    const selectedMap = referenceMapLayer(scene, selectedMapLayerId);
    const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;

    const handleAutoSize = async () => {
      if (!selectedMap || !activeSceneId) return;
      const mapUrl = assetUrls[selectedMap.assetId];
      if (!mapUrl) return;
      try {
        const { width, height } = await loadImageDimensions(mapUrl);
        setMapLayerImageSize(activeSceneId, selectedMap.id, width, height);
        const scale = autoSizeMapScaleToGrid(width, height, selectedMap.transform.scale);
        updateMapLayerTransform(
          activeSceneId,
          selectedMap.id,
          mapTransformAlignedToGridCorner({ ...selectedMap.transform, scale }, gridOffset),
          { recenter: true },
        );
      } catch {
        // ignore load failures
      }
    };

    return (
      <ToolOptionPanelRow>
        <ToolOptionGroup title="Grid">
          <ToolOptionToggle
            label="Grid"
            active={sceneEditMode === 'grid'}
            onClick={() => setSceneEditMode('grid')}
            title="Edit grid"
          >
            <img src={`${base}icons/toolbar/grid.png`} alt="" className="h-5 w-5 object-contain" />
          </ToolOptionToggle>
          <ToolOptionToggle
            label={gridVisible ? 'Hide' : 'Show'}
            active={gridVisible}
            onClick={() => setGridVisible(!gridVisible)}
            title={gridVisible ? 'Hide grid' : 'Show grid'}
          />
        </ToolOptionGroup>
        <ToolOptionGroup title="Map">
          <ToolOptionToggle
            label="Map"
            active={sceneEditMode === 'map'}
            onClick={() => setSceneEditMode('map')}
            title="Edit map"
          >
            <MapOptionIcon />
          </ToolOptionToggle>
          <ToolOptionButton label="Upload" onClick={() => fileRef.current?.click()} />
          <ToolOptionButton
            label="Size to Grid"
            disabled={!selectedMap}
            onClick={() => void handleAutoSize()}
            title={selectedMap ? 'Auto-size map to grid' : 'Select or upload a map first'}
          />
          <ToolOptionButton
            label="Align to Grid Corner"
            disabled={!selectedMap}
            onClick={() => {
              if (!selectedMap || !activeSceneId) return;
              updateMapLayerTransform(
                activeSceneId,
                selectedMap.id,
                mapTransformAlignedToGridCorner(selectedMap.transform, gridOffset),
                { recenter: true },
              );
            }}
            title={selectedMap ? 'Align map to grid corner' : 'Select or upload a map first'}
          />
        </ToolOptionGroup>
        <HiddenMapUploadInput fileRef={fileRef} onUpload={(f) => void handleUpload(f)} />
      </ToolOptionPanelRow>
    );
  }

  if (activeTool === 'gridEdit' && !asPlayer) {
    return (
      <ToolOptionPanelRow>
        <ToolOptionGroup title="Grid">
          <ToolOptionToggle
            label={gridVisible ? 'Hide' : 'Show'}
            active={gridVisible}
            onClick={() => setGridVisible(!gridVisible)}
            title={gridVisible ? 'Hide grid' : 'Show grid'}
          />
        </ToolOptionGroup>
      </ToolOptionPanelRow>
    );
  }

  if (activeTool === 'mapEdit' && !asPlayer) {
    return (
      <ToolOptionPanelRow>
        <ToolOptionGroup title="Map">
          <ToolOptionButton label="Upload" onClick={() => fileRef.current?.click()} />
        </ToolOptionGroup>
        <HiddenMapUploadInput fileRef={fileRef} onUpload={(f) => void handleUpload(f)} />
      </ToolOptionPanelRow>
    );
  }

  if (activeTool === 'fog' && !asPlayer) {
    return (
      <ToolOptionPanelRow>
        <ToolOptionGroup title="Shapes">
          {FOG_SHAPES.map((s) => (
            <ShapeOptionButton
              key={s.id}
              shape={s}
              selected={fogShape === s.id}
              onSelect={() => setFogShape(s.id)}
              icon={
                <img src={`${base}${s.icon.replace(/^\//, '')}`} alt="" className="h-5 w-5" />
              }
            />
          ))}
        </ToolOptionGroup>
        <ToolOptionGroup title="Mode">
          <ToolOptionSegmentedControl
            tone="emerald"
            segments={[
              {
                id: 'hide',
                label: 'Hide',
                active: fogMode === 'hide',
                onClick: () => setFogMode('hide'),
                icon: <FogPlusIcon />,
              },
              {
                id: 'reveal',
                label: 'Reveal',
                active: fogMode === 'reveal',
                onClick: () => setFogMode('reveal'),
                icon: <FogMinusIcon />,
              },
            ]}
          />
        </ToolOptionGroup>
        <ToolOptionStandalone>
          <ToolOptionToggle
            label="Preview"
            active={fogOpaquePreview}
            onClick={() => setFogOpaquePreview(!fogOpaquePreview)}
            title="Hold Shift to preview opaque player fog"
            tone="violet"
          >
            <span className="flex flex-col items-center gap-0.5">
              <ToolOptionShortcutBadge label="Shift" />
              <FogEyeIcon />
            </span>
          </ToolOptionToggle>
        </ToolOptionStandalone>
        <ToolOptionGroup title="Area">
          <ToolOptionSegmentedControl
            tone="amber"
            segments={[
              {
                id: 'clear',
                label: 'Clear',
                active: false,
                onClick: async () => {
                  const confirmed = await confirmAction({
                    title: 'Clear fog',
                    message: 'Clear all fog from this scene?',
                    confirmLabel: 'Clear fog',
                  });
                  if (!confirmed) return;
                  revealAllFog(activeSceneId);
                },
                icon: <FogClearIcon />,
              },
              {
                id: 'full',
                label: 'Full',
                active: scene.fog.defaultHidden,
                onClick: async () => {
                  const enabling = !scene.fog.defaultHidden;
                  const message = enabling ? 'Cover every map with fog?' : 'Remove full map fog?';
                  const confirmed = await confirmAction({
                    title: enabling ? 'Enable full fog' : 'Remove full fog',
                    message,
                    confirmLabel: enabling ? 'Cover maps' : 'Remove fog',
                  });
                  if (!confirmed) return;
                  setFogDefaultHidden(activeSceneId, enabling);
                },
                icon: <FogFullIcon />,
              },
            ]}
          />
        </ToolOptionGroup>
      </ToolOptionPanelRow>
    );
  }

  if (activeTool === 'measure') {
    const displaySegment =
      measureDebugDualView ? 'both' : measureDisplayStyle === '5e' ? '5e' : 'vtt';

    return (
      <ToolOptionPanelRow>
        <ToolOptionGroup title="Shapes">
          {MEASURES.map((m) => (
            <ShapeOptionButton
              key={m.id}
              shape={m}
              selected={measureKind === m.id}
              onSelect={() => setMeasureKind(m.id)}
              icon={
                <img src={`${base}${m.icon.replace(/^\//, '')}`} alt="" className="h-5 w-5" />
              }
              showShortcut
            />
          ))}
        </ToolOptionGroup>
        <ToolOptionGroup title="Display">
          <ToolOptionSegmentedControl
            tone="sky"
            segments={[
              {
                id: 'vtt',
                label: 'VTT',
                active: displaySegment === 'vtt',
                onClick: () => {
                  setMeasureDisplayStyle('vtt');
                  setMeasureDebugDualView(false);
                },
                title: 'VTT — smooth shapes',
              },
              {
                id: '5e',
                label: '5e',
                active: displaySegment === '5e',
                onClick: () => {
                  setMeasureDisplayStyle('5e');
                  setMeasureDebugDualView(false);
                },
                title: '5e — highlight affected grid cells',
              },
              {
                id: 'both',
                label: 'Both',
                active: displaySegment === 'both',
                onClick: () => setMeasureDebugDualView(true),
                title: 'Show VTT and 5e overlays at the same time',
              },
            ]}
          />
        </ToolOptionGroup>
        <ToolOptionGroup title="Pinned">
          <ToolOptionToggle
            label="Pin Measurement"
            active={measurePinMode}
            onClick={() => setMeasurePinMode(!measurePinMode)}
            title="Pin measurements to the map (Shift)"
            tone="emerald"
          >
            <ToolOptionShortcutBadge label="Shift" />
          </ToolOptionToggle>
          <ToolOptionButton
            label="Dismiss All Pinned"
            disabled={ownedMeasurementCount === 0}
            onClick={() => fadeAndRemoveMeasurementsForCurrentUser(activeSceneId)}
            title="Fade and remove all measurements you pinned"
          />
        </ToolOptionGroup>
        <ToolOptionStandalone>
          <ToolOptionToggle
            label="Use Alt. Diagonals"
            active={alternatingDiagonals}
            onClick={() => setAlternatingDiagonals(!alternatingDiagonals)}
          />
        </ToolOptionStandalone>
      </ToolOptionPanelRow>
    );
  }

  if (activeTool === 'draw') {
    return (
      <ToolOptionPanelRow>
        <ToolOptionGroup>
          {DRAW_SHAPES.map((s) => (
            <ShapeOptionButton
              key={s.id}
              shape={s}
              selected={drawShape === s.id}
              onSelect={() => setDrawShape(s.id)}
              icon={<DrawShapeIcon shape={s.id} />}
              showShortcut
            />
          ))}
        </ToolOptionGroup>
        <ToolOptionGroup>
          <DrawHuePicker hue={drawHue} onChange={setDrawHue} variant="swatch" toolOption />
          <DrawOutlineSlider value={drawStrokeWidth} onChange={setDrawStrokeWidth} />
        </ToolOptionGroup>
      </ToolOptionPanelRow>
    );
  }

  return null;
}
