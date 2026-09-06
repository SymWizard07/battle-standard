/**
 * Stat field expressions: additives (+2), dice (1d8+3), and place-time
 * evaluation when preceded by * (*4d6+2 → rolled number).
 * Spaces around +/− are allowed in input and ignored when parsing.
 */

const EXPRESSION_BODY =
  /^[+-]?(?:\d*d\d+|\d+)(?:[+-](?:\d*d\d+|\d+))*$/i;

/** Optional whitespace around continuing +/− terms (for free-text / whole-field match). */
const EXPR_CONTINUATION = String.raw`(?:\s*[+-]\s*(?:\d*d\d+|\d+))*`;
const EXPR_CORE = String.raw`[+-]?(?:\d*d\d+|\d+)${EXPR_CONTINUATION}`;

/** Strip whitespace for validation / evaluation (spaces are display-only). */
function compactStatExpression(s: string): string {
  return s.replace(/\s+/g, '');
}

/** Keep digits, d/D, +/−, *, and spaces (around operators). */
export function sanitizeStatExpression(raw: string): string {
  return raw.replace(/[^0-9dD+*\-\s]/g, '');
}

/**
 * True for signed additives, dice formulas, or *-prefixed place-time expressions
 * (e.g. +1, -2, 1d10, +1d10-1, *4d6), not plain unsigned integers.
 */
export function isStatExpressionHighlight(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  const starred = v.startsWith('*');
  const body = compactStatExpression(starred ? v.slice(1) : v);
  if (!body || !EXPRESSION_BODY.test(body)) return false;
  if (starred) return true;
  return /[dD]/.test(body) || /^[+-]/.test(body) || /[+-]/.test(body.slice(1));
}

/** Dice / signed expression tokens inside free text (optional leading *). */
export const STAT_EXPRESSION_TOKEN = new RegExp(
  String.raw`\*?[+-]?(?:\d*d\d+|\d+)(?:\s*[+-]\s*(?:\d*d\d+|\d+))+|\*?[+-]\d+|\*?(?:\d*)d\d+`,
  'gi',
);

const WHOLE_STAR_EXPRESSION = new RegExp(String.raw`^\*${EXPR_CORE}$`, 'i');

const INLINE_STAR_EXPRESSION = new RegExp(String.raw`\*(${EXPR_CORE})`, 'gi');

export type Rng = () => number;

function rollDie(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}

function evalDiceTerm(countRaw: string, sidesRaw: string, rng: Rng): number | null {
  const count = countRaw === '' ? 1 : Number.parseInt(countRaw, 10);
  const sides = Number.parseInt(sidesRaw, 10);
  if (!Number.isFinite(count) || !Number.isFinite(sides)) return null;
  if (count < 1 || sides < 1 || count > 100 || sides > 1000) return null;
  let sum = 0;
  for (let i = 0; i < count; i++) sum += rollDie(sides, rng);
  return sum;
}

/**
 * Evaluate a stat expression to a number (dice are rolled).
 * Leading * is ignored. Returns null if the string is not a valid expression.
 */
export function evaluateStatExpression(raw: string, rng: Rng = Math.random): number | null {
  let s = compactStatExpression(raw.trim());
  if (!s) return null;
  if (s.startsWith('*')) s = s.slice(1);
  if (!s || !EXPRESSION_BODY.test(s)) return null;

  let total = 0;
  let pos = 0;
  let expectSign = false;
  while (pos < s.length) {
    let sign = 1;
    const ch = s[pos];
    if (ch === '+' || ch === '-') {
      sign = ch === '-' ? -1 : 1;
      pos++;
    } else if (expectSign) {
      return null;
    }

    const dice = /^(\d*)d(\d+)/i.exec(s.slice(pos));
    if (dice) {
      const rolled = evalDiceTerm(dice[1] ?? '', dice[2] ?? '', rng);
      if (rolled == null) return null;
      total += sign * rolled;
      pos += dice[0].length;
    } else {
      const num = /^\d+/.exec(s.slice(pos));
      if (!num) return null;
      total += sign * Number.parseInt(num[0], 10);
      pos += num[0].length;
    }
    expectSign = true;
  }
  return total;
}

/**
 * Format a rolled/evaluated number. When `preserveSignPrefix` is set and the
 * original expression led with +, keep that + on non-negative results (mod/save).
 */
export function formatEvaluatedExpression(
  originalExpr: string,
  result: number,
  preserveSignPrefix = false,
): string {
  if (!preserveSignPrefix) return String(result);
  let body = originalExpr.trim();
  if (body.startsWith('*')) body = body.slice(1).trim();
  if (body.startsWith('+') && result >= 0) return `+${result}`;
  return String(result);
}

/**
 * Resolve *-prefixed expressions in a field value for token placement.
 * - Whole field `*1d8+2` → rolled number string
 * - Inline `Claw *1d6+2` → `Claw 5` (example)
 * Expressions without * are left unchanged.
 */
export function resolveStarExpressions(
  value: string,
  rng: Rng = Math.random,
  preserveSignPrefix = false,
): string {
  if (!value.includes('*')) return value;
  const trimmed = value.trim();
  if (WHOLE_STAR_EXPRESSION.test(trimmed)) {
    const n = evaluateStatExpression(trimmed, rng);
    return n == null ? value : formatEvaluatedExpression(trimmed, n, preserveSignPrefix);
  }
  return value.replace(INLINE_STAR_EXPRESSION, (full, expr: string) => {
    const n = evaluateStatExpression(expr, rng);
    return n == null ? full : formatEvaluatedExpression(full, n, preserveSignPrefix);
  });
}

const WHOLE_FIELD_EXPRESSION = new RegExp(String.raw`^\s*(\*?${EXPR_CORE})\s*$`, 'i');

export type EvaluateExpressionOptions = {
  preserveSignPrefix?: boolean;
};

/**
 * Ctrl/Cmd+click: evaluate the expression at `index` (or the whole field if it
 * is a single expression). Returns the updated string, or null if nothing to do.
 */
export function tryEvaluateExpressionAt(
  value: string,
  index: number,
  rng: Rng = Math.random,
  options?: EvaluateExpressionOptions,
): string | null {
  const preserveSignPrefix = options?.preserveSignPrefix === true;
  const whole = WHOLE_FIELD_EXPRESSION.exec(value);
  if (whole?.[1] && isStatExpressionHighlight(whole[1])) {
    const n = evaluateStatExpression(whole[1], rng);
    return n == null ? null : formatEvaluatedExpression(whole[1], n, preserveSignPrefix);
  }

  const re = new RegExp(STAT_EXPRESSION_TOKEN.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) != null) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;
    if (index < start || index > end) continue;
    if (!isStatExpressionHighlight(token)) continue;
    const n = evaluateStatExpression(token, rng);
    if (n == null) return null;
    return (
      value.slice(0, start) +
      formatEvaluatedExpression(token, n, preserveSignPrefix) +
      value.slice(end)
    );
  }
  return null;
}
