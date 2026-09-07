import { useCallback, useEffect, useMemo, useState } from 'react';
import { DiceShowcaseRow } from '../dice/DiceShowcaseRow';
import { useDieFaceShaderStore } from '../dice/dieFaceShaderStore';
import { SHADER_PREVIEW_STARTER } from '../dice/faceShaderLib';
import { rateFragmentShaderCost, shaderCostBand } from '../dice/shaderCost';
import { ShaderPreviewSquare } from './ShaderPreviewSquare';
import { useSettingsUiStore } from './settingsUiStore';

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
          <div
            className={`mx-auto aspect-square w-20 shrink-0 overflow-hidden rounded-lg border bg-slate-950/60 sm:w-24 ${
              dragSource
                ? 'cursor-grabbing border-sky-500/80'
                : 'cursor-grab border-slate-700/80'
            }`}
            onPointerDown={(e) => {
              if (!canApply) return;
              e.preventDefault();
              beginDrag(applied);
            }}
            title="Drag onto a die above"
          >
            <ShaderPreviewSquare
              fragmentSource={applied}
              active={playgroundActive}
              className="h-full w-full"
              onCompileResult={onCompileResult}
            />
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
              onClick={() => setAllShaders(applied)}
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
