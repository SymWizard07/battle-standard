/**
 * Heuristic cost score for a GLSL fragment shader (0 = light, 1 = heavy).
 * Not a profiler — counts loops, texture fetches, and noisy math patterns.
 */
export function rateFragmentShaderCost(source: string): number {
  const src = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  let score = 0;

  const textureCalls = (src.match(/\btexture2D\s*\(/g) ?? []).length
    + (src.match(/\btexture\s*\(/g) ?? []).length;
  score += textureCalls * 0.06;

  // Explicit loop trip counts: for (int i = 0; i < N; i++)
  for (const m of src.matchAll(/\bfor\s*\(\s*int\s+\w+\s*=\s*\d+\s*;\s*\w+\s*<\s*(\d+)/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) score += Math.min(12, n) * 0.045;
  }
  // Uncounted / while loops
  score += (src.match(/\bfor\s*\(/g) ?? []).length * 0.04;
  score += (src.match(/\bwhile\s*\(/g) ?? []).length * 0.08;

  // Common expensive building blocks
  score += (src.match(/\bfbm\s*\(/g) ?? []).length * 0.12;
  score += (src.match(/\bnoise\s*\(/g) ?? []).length * 0.05;
  score += (src.match(/\bpow\s*\(/g) ?? []).length * 0.02;
  score += (src.match(/\bexp\s*\(/g) ?? []).length * 0.025;
  score += (src.match(/\blog\s*\(/g) ?? []).length * 0.025;
  score += (src.match(/\bsin\s*\(|\bcos\s*\(|\batan\s*\(|\batan2\s*\(/g) ?? []).length * 0.012;
  score += (src.match(/\bsmoothstep\s*\(/g) ?? []).length * 0.01;
  score += (src.match(/\bnormalize\s*\(/g) ?? []).length * 0.008;
  score += (src.match(/\blength\s*\(|\bdistance\s*\(|\bdot\s*\(|\bcross\s*\(/g) ?? []).length * 0.006;

  // Rough size / branching
  const lines = src.split('\n').filter((l) => l.trim().length > 0).length;
  score += Math.min(0.25, lines * 0.0025);
  score += (src.match(/\bif\s*\(/g) ?? []).length * 0.008;

  return Math.max(0, Math.min(1, score));
}

export type ShaderCostBand = 'low' | 'mid' | 'high';

export function shaderCostBand(score: number): ShaderCostBand {
  if (score < 0.34) return 'low';
  if (score < 0.67) return 'mid';
  return 'high';
}
