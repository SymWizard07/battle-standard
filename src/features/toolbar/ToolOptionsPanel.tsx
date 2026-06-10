import type { ReactNode } from 'react';
import { useMemo, useRef } from 'react';
import type { MeasureKind, MeasureDisplayStyle, DrawToolShape } from '../../lib/types';
import { newId } from '../../lib/ids';
import { saveAsset } from '../../lib/db';
import {
  autoSizeMapScaleToGrid,
  loadImageDimensions,
  mapTransformAlignedToGridCorner,
} from '../../lib/mapAlign';
import { confirmAction } from '../confirm/confirmDialogStore';
import { SessionPanelContent } from '../session/SessionPanelContent';
import { useActiveScene, seesAsPlayer, useStore } from '../../store/useStore';
import { DEFAULT_GRID_OFFSET } from '../../lib/fixedGrid';
import {
  DRAW_STROKE_WIDTH_MAX,
  DRAW_STROKE_WIDTH_MIN,
} from '../../lib/drawConstants';
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
  toolBarBtn,
  toolBarBtnActive,
  toolBarBtnIcon,
  toolBarControl,
  toolBarRow,
  toolBarSection,
  toolBarSectionLabel,
} from './toolBarStyles';

interface ShapeOption {
  id: string;
  label: string;
  icon?: string;
  digit: number;
}

function MeasureDisplayStyleToggle({
  style,
  onToggle,
}: {
  style: MeasureDisplayStyle;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${toolBarControl} rounded-lg px-3 text-xs font-bold uppercase tracking-tight ${
        style === '5e'
          ? 'bg-amber-700 text-white'
          : 'bg-slate-700 text-slate-200'
      }`}
      title={
        style === 'vtt'
          ? 'VTT — smooth shapes. Switch to 5e grid highlighting.'
          : '5e — highlight affected grid cells. Switch to VTT smooth shapes.'
      }
      aria-label={`Measure display: ${style === 'vtt' ? 'VTT' : '5e grid'}. Click to toggle.`}
    >
      {style === 'vtt' ? 'VTT' : '5e'}
    </button>
  );
}

function ShapePickerButton({
  shape,
  selected,
  onSelect,
  activeClass,
  idleClass,
  icon,
}: {
  shape: ShapeOption;
  selected: boolean;
  onSelect: () => void;
  activeClass: string;
  idleClass: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${toolBarBtnIcon} ${
        selected ? activeClass : idleClass
      }`}
      title={`${shape.label} (${shape.digit})`}
      aria-label={`${shape.label}, shortcut ${shape.digit}`}
    >
      {icon}
      {shape.label}
    </button>
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

const btn = toolBarBtn;
const btnActive = toolBarBtnActive;
const btnIcon = toolBarBtnIcon;
const section = toolBarSection;
const sectionLabel = toolBarSectionLabel;

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
  const measureDebugDualView = useStore((s) => s.measureDebugDualView);
  const setMeasureDebugDualView = useStore((s) => s.setMeasureDebugDualView);
  const fadeAndRemoveMeasurementsForCurrentUser = useStore(
    (s) => s.fadeAndRemoveMeasurementsForCurrentUser,
  );
  const toggleMeasureDisplayStyle = useStore((s) => s.toggleMeasureDisplayStyle);
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
    return <SessionPanelContent />;
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
      <div className={`${toolBarRow} gap-3`}>
        <label
          className={`${toolBarBtnIcon} cursor-pointer bg-slate-800 text-slate-200`}
          title="Click or marquee-select lines and shapes drawn on the map"
        >
          <input
            type="checkbox"
            checked={selectDrawShapes}
            onChange={(e) => setSelectDrawShapes(e.target.checked)}
          />
          Select drawn shapes
        </label>
        <button
          type="button"
          className={`${toolBarBtnIcon} bg-slate-800 text-slate-200 enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40`}
          disabled={!canActOnSelection}
          onClick={() => {
            if (activeSceneId) duplicateSelection(activeSceneId);
          }}
          title="Duplicate selection (Shift+D)"
        >
          Duplicate
        </button>
        <button
          type="button"
          className={`${toolBarBtnIcon} bg-red-950/80 text-red-100 enabled:hover:bg-red-900/80 disabled:cursor-not-allowed disabled:opacity-40`}
          disabled={!canActOnSelection}
          onClick={() => {
            if (activeSceneId) deleteSelection(activeSceneId);
          }}
          title="Delete selection"
        >
          Delete
        </button>
        <span className="hidden text-xs text-slate-500 lg:inline">Shift+D duplicate</span>
      </div>
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
      <div className={toolBarRow}>
        <div className={section}>
          <span className={sectionLabel}>Grid</span>
          <button
            type="button"
            className={`${btnIcon} ${sceneEditMode === 'grid' ? btnActive : btn}`}
            onClick={() => setSceneEditMode('grid')}
          >
            <img src={`${base}icons/toolbar/grid.png`} alt="" className="h-5 w-5 object-contain" />
            Edit
          </button>
          <button type="button" className={btn} onClick={() => setGridVisible(!gridVisible)}>
            {gridVisible ? 'Hide grid' : 'Show grid'}
          </button>
          <button
            type="button"
            className={`${btn} disabled:cursor-not-allowed disabled:opacity-40`}
            disabled={!selectedMap}
            title={selectedMap ? undefined : 'Select or upload a map first'}
            onClick={() => void handleAutoSize()}
          >
            Auto size
          </button>
        </div>

        <div className={section}>
          <span className={sectionLabel}>Map</span>
          <button
            type="button"
            className={`${btnIcon} ${sceneEditMode === 'map' ? btnActive : btn}`}
            onClick={() => setSceneEditMode('map')}
          >
            <MapOptionIcon />
            Edit
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
              e.target.value = '';
            }}
          />
          <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
            Upload map
          </button>
          <button
            type="button"
            className={`${btn} disabled:cursor-not-allowed disabled:opacity-40`}
            disabled={!selectedMap}
            title={selectedMap ? undefined : 'Select or upload a map first'}
            onClick={() => {
              if (!selectedMap || !activeSceneId) return;
              updateMapLayerTransform(
                activeSceneId,
                selectedMap.id,
                mapTransformAlignedToGridCorner(selectedMap.transform, gridOffset),
                { recenter: true },
              );
            }}
          >
            Align to grid
          </button>
          <span className="hidden text-xs text-slate-500 lg:inline">
            Drag to move · corner handles to scale
          </span>
        </div>
      </div>
    );
  }

  if (activeTool === 'gridEdit' && !asPlayer) {
    return (
      <div className={toolBarRow}>
        <button type="button" className={btn} onClick={() => setGridVisible(!gridVisible)}>
          {gridVisible ? 'Hide grid' : 'Show grid'}
        </button>
      </div>
    );
  }

  if (activeTool === 'mapEdit' && !asPlayer) {
    return (
      <div className={toolBarRow}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = '';
          }}
        />
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
          Upload map
        </button>
        <span className="text-xs text-slate-500">Drag to move · corner handles to scale</span>
      </div>
    );
  }

  if (activeTool === 'fog' && !asPlayer) {
    return (
      <div className={toolBarRow}>
        {FOG_SHAPES.map((s) => (
          <ShapePickerButton
            key={s.id}
            shape={s}
            selected={fogShape === s.id}
            onSelect={() => setFogShape(s.id)}
            activeClass="bg-amber-600 text-white"
            idleClass="bg-slate-800 text-slate-200"
            icon={
              <img src={`${base}${s.icon.replace(/^\//, '')}`} alt="" className="h-5 w-5" />
            }
          />
        ))}
        <button
          type="button"
          className={`${btnIcon} ${fogMode === 'hide' ? btnActive : btn}`}
          onClick={() => setFogMode('hide')}
        >
          <FogPlusIcon />
          Hide
        </button>
        <button
          type="button"
          className={`${btnIcon} ${fogMode === 'reveal' ? btnActive : btn}`}
          onClick={() => setFogMode('reveal')}
        >
          <FogMinusIcon />
          Reveal
        </button>
        <button
          type="button"
          className={`${btnIcon} ${fogOpaquePreview ? btnActive : btn}`}
          onClick={() => setFogOpaquePreview(!fogOpaquePreview)}
          title={fogOpaquePreview ? 'Show GM fog transparency' : 'Preview opaque player fog'}
        >
          <FogEyeIcon />
          Preview
        </button>
        <button
          type="button"
          className={`${btnIcon} ${btn}`}
          onClick={async () => {
            const confirmed = await confirmAction({
              title: 'Clear fog',
              message: 'Clear all fog from this scene?',
              confirmLabel: 'Clear fog',
            });
            if (!confirmed) return;
            revealAllFog(activeSceneId);
          }}
        >
          <FogClearIcon />
          Clear fog
        </button>
        <button
          type="button"
          className={
            scene.fog.defaultHidden
              ? `${btnIcon} bg-amber-700 text-xs text-white`
              : `${btnIcon} ${btn}`
          }
          onClick={async () => {
            const enabling = !scene.fog.defaultHidden;
            const message = enabling
              ? 'Cover every map with fog?'
              : 'Remove full map fog?';
            const confirmed = await confirmAction({
              title: enabling ? 'Enable full fog' : 'Remove full fog',
              message,
              confirmLabel: enabling ? 'Cover maps' : 'Remove fog',
            });
            if (!confirmed) return;
            setFogDefaultHidden(activeSceneId, enabling);
          }}
        >
          <FogFullIcon />
          Full fog
        </button>
      </div>
    );
  }

  if (activeTool === 'measure') {
    return (
      <div className={toolBarRow}>
        {MEASURES.map((m) => (
          <ShapePickerButton
            key={m.id}
            shape={m}
            selected={measureKind === m.id}
            onSelect={() => setMeasureKind(m.id)}
            activeClass="bg-amber-600 text-white"
            idleClass="bg-slate-800 text-slate-200"
            icon={
              <img src={`${base}${m.icon.replace(/^\//, '')}`} alt="" className="h-5 w-5" />
            }
          />
        ))}
        <MeasureDisplayStyleToggle
          style={measureDisplayStyle}
          onToggle={toggleMeasureDisplayStyle}
        />
        <label
          className={`${toolBarBtnIcon} bg-slate-800 text-slate-200`}
          title="Debug: show VTT (amber) and 5e grid (sky) overlays at the same time"
        >
          <input
            type="checkbox"
            checked={measureDebugDualView}
            onChange={(e) => setMeasureDebugDualView(e.target.checked)}
          />
          Both
        </label>
        <button
          type="button"
          onClick={() => setMeasurePinMode(!measurePinMode)}
          className={`${toolBarControl} rounded-lg px-3 text-xs ${
            measurePinMode ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-200'
          }`}
        >
          Pin
        </button>
        <button
          type="button"
          disabled={ownedMeasurementCount === 0}
          onClick={() => fadeAndRemoveMeasurementsForCurrentUser(activeSceneId)}
          className={`${btnIcon} ${ownedMeasurementCount === 0 ? 'cursor-not-allowed opacity-40' : btn}`}
          title="Fade and remove all measurements you pinned"
        >
          Dismiss all
        </button>
        <label className={`${toolBarBtnIcon} text-slate-300`}>
          <input
            type="checkbox"
            checked={alternatingDiagonals}
            onChange={(e) => setAlternatingDiagonals(e.target.checked)}
          />
          Alt. diagonals
        </label>
      </div>
    );
  }

  if (activeTool === 'draw') {
    const erasing = drawShape === 'erase';
    return (
      <div className={toolBarRow}>
        {!erasing && <DrawHuePicker hue={drawHue} onChange={setDrawHue} />}
        {DRAW_SHAPES.map((s) => (
          <ShapePickerButton
            key={s.id}
            shape={s}
            selected={drawShape === s.id}
            onSelect={() => setDrawShape(s.id)}
            activeClass="bg-amber-600 text-white"
            idleClass="bg-slate-800 text-slate-200"
            icon={<DrawShapeIcon shape={s.id} />}
          />
        ))}
        <label className={`${toolBarControl} flex min-w-[10rem] items-center gap-2 overflow-hidden rounded-lg bg-slate-800 px-2 text-xs text-slate-200`}>
          <span className="shrink-0 text-[10px] text-slate-400">Outline</span>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0">
            <div
              className="flex justify-between px-0.5 text-[10px] leading-none text-slate-500"
              aria-hidden
            >
              <span>−</span>
              <span>+</span>
            </div>
            <input
              type="range"
              min={DRAW_STROKE_WIDTH_MIN}
              max={DRAW_STROKE_WIDTH_MAX}
              value={drawStrokeWidth}
              onChange={(e) => setDrawStrokeWidth(Number(e.target.value))}
              className="w-full min-w-0"
              aria-label="Outline width"
            />
          </div>
          <span className="w-4 shrink-0 text-right text-[10px] tabular-nums">{drawStrokeWidth}</span>
        </label>
      </div>
    );
  }

  return null;
}
