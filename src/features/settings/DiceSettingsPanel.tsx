import { useCallback, useEffect, useMemo, useState } from 'react';
import { DiceShowcaseRow } from '../dice/DiceShowcaseRow';
import {
  DEFAULT_DIE_FACE_FONT_ID,
  DEFAULT_DIE_FACE_FONT_SIZE,
  DEFAULT_DIE_FACE_OFFSET,
  DEFAULT_DIE_FACE_SAMPLE,
  DIE_FACE_FONTS,
  DIE_FACE_FONT_SIZE_MAX,
  DIE_FACE_FONT_SIZE_MIN,
  DIE_FACE_FONT_SIZE_STEP,
  DIE_FACE_OFFSET_MAX,
  DIE_FACE_OFFSET_MIN,
  DIE_FACE_OFFSET_STEP,
  DIE_FACE_SAMPLE_NUMBERS,
  clampDieFaceFontSize,
  clampDieFaceOffset,
  defaultDieFaceGlyphLayout,
  dieFaceFontFamily,
  ensureDieFaceFontLoaded,
  isDieFaceFontId,
  type DieFaceFontId,
  type DieFaceSampleNumber,
} from '../dice/dieFaceFonts';
import { useDieFaceShaderStore } from '../dice/dieFaceShaderStore';
import {
  clearPreviewGlyphCache,
  SHADER_PREVIEW_STARTER,
} from '../dice/faceShaderLib';
import { invalidateDieFaceTextureCache } from '../dice/dieFaceTextures';
import { rateFragmentShaderCost, shaderCostBand } from '../dice/shaderCost';
import { ShaderPreviewSquare } from './ShaderPreviewSquare';
import { useSettingsUiStore } from './settingsUiStore';

function GlyphSliderStepper({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="die-glyph-slider min-w-0 flex-1"
          aria-label={label}
        />
        <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-700 bg-slate-900">
          <span
            className="flex min-w-[2.6rem] items-center justify-center px-1 py-1 text-[11px] tabular-nums text-slate-100"
            aria-live="polite"
          >
            {format(value)}
          </span>
          <div className="flex w-5 flex-col border-l border-slate-700">
            <button
              type="button"
              className="flex flex-1 items-center justify-center text-[9px] leading-none text-slate-300 hover:bg-slate-800 disabled:opacity-30"
              aria-label={`Increase ${label}`}
              disabled={value >= max}
              onClick={() => onChange(Math.min(max, value + step))}
            >
              ▲
            </button>
            <button
              type="button"
              className="flex flex-1 items-center justify-center border-t border-slate-700 text-[9px] leading-none text-slate-300 hover:bg-slate-800 disabled:opacity-30"
              aria-label={`Decrease ${label}`}
              disabled={value <= min}
              onClick={() => onChange(Math.max(min, value - step))}
            >
              ▼
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Dice showcase + fragment-shader playground for the Settings modal. */
export function DiceSettingsPanel() {
  const settingsOpen = useSettingsUiStore((s) => s.open);
  const activeTab = useSettingsUiStore((s) => s.activeTab);
  const playgroundActive = settingsOpen && activeTab === 'dice';

  const beginDrag = useDieFaceShaderStore((s) => s.beginDrag);
  const endDrag = useDieFaceShaderStore((s) => s.endDrag);
  const setAllShaders = useDieFaceShaderStore((s) => s.setAllShaders);
  const resetToDefaults = useDieFaceShaderStore((s) => s.resetToDefaults);
  const dragSource = useDieFaceShaderStore((s) => s.dragSource);

  const [draft, setDraft] = useState(SHADER_PREVIEW_STARTER);
  const [applied, setApplied] = useState(SHADER_PREVIEW_STARTER);
  const [error, setError] = useState<string | null>(null);
  const [fontId, setFontId] = useState<DieFaceFontId>(DEFAULT_DIE_FACE_FONT_ID);
  const [sampleNumber, setSampleNumber] =
    useState<DieFaceSampleNumber>(DEFAULT_DIE_FACE_SAMPLE);
  const [fontSize, setFontSize] = useState(DEFAULT_DIE_FACE_FONT_SIZE);
  const [offsetX, setOffsetX] = useState(DEFAULT_DIE_FACE_OFFSET);
  const [offsetY, setOffsetY] = useState(DEFAULT_DIE_FACE_OFFSET);
  const [glyphReady, setGlyphReady] = useState(0);

  const glyphLayout = useMemo(
    () =>
      defaultDieFaceGlyphLayout({
        fontId,
        fontSize,
        offsetX,
        offsetY,
      }),
    [fontId, fontSize, offsetX, offsetY],
  );

  const onCompileResult = useCallback((msg: string | null) => {
    setError(msg);
  }, []);

  const compile = () => {
    setApplied(draft);
  };

  const costScore = useMemo(
    () => (error ? 0 : rateFragmentShaderCost(applied)),
    [applied, error],
  );
  const costBand = shaderCostBand(costScore);
  const costLabel =
    costBand === 'low' ? 'Light' : costBand === 'mid' ? 'Moderate' : 'Heavy';

  useEffect(() => {
    let cancelled = false;
    void ensureDieFaceFontLoaded(fontId).then(() => {
      if (cancelled) return;
      clearPreviewGlyphCache(dieFaceFontFamily(fontId));
      invalidateDieFaceTextureCache(fontId);
      setGlyphReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [fontId]);

  useEffect(() => {
    if (!dragSource) return;
    // Capture phase so we only clear when the pointer is released away from a die;
    // die onPointerUp applies first on the canvas target, then bubbles here.
    const onUp = () => {
      // Defer so R3F die onPointerUp can apply before drag clears.
      queueMicrotask(() => {
        if (useDieFaceShaderStore.getState().dragSource) endDrag();
      });
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragSource, endDrag]);

  const canApply = !error;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto h-36 w-full max-w-4xl shrink-0 sm:h-40">
        <DiceShowcaseRow active={playgroundActive} className="h-full w-full" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-1 sm:p-2">
        <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-2">
          <div className="mx-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <div
              className={`aspect-square w-20 shrink-0 overflow-hidden rounded-lg border bg-slate-950/60 sm:w-24 ${
                dragSource
                  ? 'cursor-grabbing border-sky-500/80'
                  : 'cursor-grab border-slate-700/80'
              }`}
              onPointerDown={(e) => {
                if (!canApply) return;
                e.preventDefault();
                beginDrag(applied, glyphLayout);
              }}
              title="Drag onto a die above"
            >
              <ShaderPreviewSquare
                fragmentSource={applied}
                active={playgroundActive}
                fontId={fontId}
                sampleNumber={sampleNumber}
                fontSize={fontSize}
                offsetX={offsetX}
                offsetY={offsetY}
                glyphEpoch={glyphReady}
                className="h-full w-full"
                onCompileResult={onCompileResult}
              />
            </div>

            <div className="flex w-[11.5rem] flex-col gap-1.5 sm:w-56">
              <div className="flex gap-1.5">
                <label className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    Font
                  </span>
                  <select
                    value={fontId}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (isDieFaceFontId(next)) setFontId(next);
                    }}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-600/80"
                    aria-label="Preview glyph font"
                  >
                    {DIE_FACE_FONTS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-[3.5rem] shrink-0 flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    Sample
                  </span>
                  <select
                    value={sampleNumber}
                    onChange={(e) =>
                      setSampleNumber(e.target.value as DieFaceSampleNumber)
                    }
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-600/80"
                    aria-label="Preview sample number"
                  >
                    {DIE_FACE_SAMPLE_NUMBERS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <GlyphSliderStepper
                label="Size"
                value={fontSize}
                min={DIE_FACE_FONT_SIZE_MIN}
                max={DIE_FACE_FONT_SIZE_MAX}
                step={DIE_FACE_FONT_SIZE_STEP}
                format={(n) => `${n}%`}
                onChange={(n) => setFontSize(clampDieFaceFontSize(n))}
              />
              <GlyphSliderStepper
                label="Offset X"
                value={offsetX}
                min={DIE_FACE_OFFSET_MIN}
                max={DIE_FACE_OFFSET_MAX}
                step={DIE_FACE_OFFSET_STEP}
                format={(n) => `${n > 0 ? '+' : ''}${n}`}
                onChange={(n) => setOffsetX(clampDieFaceOffset(n))}
              />
              <GlyphSliderStepper
                label="Offset Y"
                value={offsetY}
                min={DIE_FACE_OFFSET_MIN}
                max={DIE_FACE_OFFSET_MAX}
                step={DIE_FACE_OFFSET_STEP}
                format={(n) => `${n > 0 ? '+' : ''}${n}`}
                onChange={(n) => setOffsetY(clampDieFaceOffset(n))}
              />
            </div>
          </div>

          <p className="shrink-0 text-center text-xs text-slate-500">
            {dragSource
              ? 'Drop onto a showcase die to apply'
              : 'Drag the preview onto a die, or apply to all'}
          </p>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={compile}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Compile
            </button>
            <button
              type="button"
              disabled={!canApply}
              onClick={() => setAllShaders(applied, glyphLayout)}
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply to all
            </button>
            <button
              type="button"
              onClick={() => resetToDefaults()}
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-700"
            >
              Reset to default
            </button>
            <span className="text-xs text-slate-500">Ctrl/⌘+Enter</span>
          </div>

          {error ? (
            <pre className="max-h-16 shrink-0 overflow-auto whitespace-pre-wrap rounded-lg border border-rose-800/60 bg-rose-950/40 px-3 py-2 font-mono text-xs text-rose-300">
              {error}
            </pre>
          ) : null}

          <label className="flex min-h-0 flex-1 flex-col gap-1">
            <span className="flex shrink-0 items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-200">Fragment shader</span>
              <span
                className="flex min-w-[9.5rem] max-w-[12rem] flex-1 flex-col items-end gap-0.5"
                title={`Estimated cost: ${costLabel} (${Math.round(costScore * 100)}%). Heuristic from loops, textures, and math — not a live profile.`}
                aria-label={`Shader cost: ${costLabel}`}
              >
                <span className="w-full text-right text-[10px] uppercase tracking-wide text-slate-500">
                  Cost · {costLabel}
                </span>
                <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-300 ${
                      costBand === 'low'
                        ? 'bg-blue-500'
                        : costBand === 'mid'
                          ? 'bg-yellow-400'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(6, costScore * 100)}%` }}
                  />
                </span>
              </span>
            </span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  compile();
                }
              }}
              spellCheck={false}
              className="min-h-0 w-full flex-1 resize-none rounded-xl border border-slate-700/80 bg-slate-950/60 p-3 font-mono text-xs leading-relaxed text-slate-200 outline-none focus:border-sky-600/80"
              aria-label="Fragment shader source"
            />
          </label>

          <p className="shrink-0 text-xs leading-relaxed text-slate-500">
            Varyings: <span className="font-mono text-slate-400">vUv</span> (atlas /
            glyphs), <span className="font-mono text-slate-400">vPos</span> (local mesh
            position — use for seamless noise across faces). Uniforms:{' '}
            <span className="font-mono text-slate-400">uTime</span>,{' '}
            <span className="font-mono text-slate-400">uResolution</span>,{' '}
            <span className="font-mono text-slate-400">uFaceColor</span>,{' '}
            <span className="font-mono text-slate-400">uRandom</span> (per-die
            [0,1)),{' '}
            <span className="font-mono text-slate-400">uAlbedoMap</span>,{' '}
            <span className="font-mono text-slate-400">uNormalMap</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
