/**
 * Run with: npx tsx src/lib/statExpression.test.ts
 */
import {
  evaluateStatExpression,
  isStatExpressionHighlight,
  resolveStarExpressions,
  sanitizeStatExpression,
  tryEvaluateExpressionAt,
} from './statExpression';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

/** Deterministic rng sequence (values in [0,1)). */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length]!;
    i++;
    return v;
  };
}

function runTests(): void {
  assert(sanitizeStatExpression('*1d10+2!') === '*1d10+2');
  assert(sanitizeStatExpression('1d8 + 2') === '1d8 + 2');
  assert(isStatExpressionHighlight('+1'));
  assert(isStatExpressionHighlight('*4d6'));
  assert(isStatExpressionHighlight('*15'));
  assert(isStatExpressionHighlight('1d8 + 2'));
  assert(isStatExpressionHighlight('+1 + 3'));
  assert(!isStatExpressionHighlight('15'));
  assert(!isStatExpressionHighlight('*'));

  assert(evaluateStatExpression('+3') === 3);
  assert(evaluateStatExpression('*-2') === -2);
  assert(evaluateStatExpression('10+5-3') === 12);
  assert(evaluateStatExpression('10 + 5 - 3') === 12);
  assert(evaluateStatExpression('+1 + 2') === 3);

  // d6 rolls: rng 0 → 1, 0.5 → 4, 0.99 → 6
  const rng = seqRng([0, 0.5, 0.99, 0]);
  assert(evaluateStatExpression('*1d6', seqRng([0])) === 1);
  assert(evaluateStatExpression('1d6', seqRng([0.99])) === 6);
  assert(evaluateStatExpression('2d6+1', seqRng([0, 0.5])) === 1 + 4 + 1);
  assert(evaluateStatExpression('+1d10-1', seqRng([0.5])) === 6 - 1);

  assert(resolveStarExpressions('15') === '15');
  assert(resolveStarExpressions('+1d4') === '+1d4');
  assert(resolveStarExpressions('*10+2') === '12');
  assert(resolveStarExpressions('*10 + 2') === '12');
  assert(resolveStarExpressions('*1d6', seqRng([0])) === '1');
  assert(resolveStarExpressions('Claw *1d6+2 slash', seqRng([0])) === 'Claw 3 slash');
  assert(resolveStarExpressions('Claw *1d6 + 2 slash', seqRng([0])) === 'Claw 3 slash');
  assert(resolveStarExpressions('HP *8d8+40', seqRng(Array(8).fill(0))) === 'HP 48');

  assert(tryEvaluateExpressionAt('+1d6', 0, seqRng([0])) === '1');
  assert(tryEvaluateExpressionAt('+1d6', 0, seqRng([0]), { preserveSignPrefix: true }) === '+1');
  assert(tryEvaluateExpressionAt('+3', 0, Math.random, { preserveSignPrefix: true }) === '+3');
  assert(tryEvaluateExpressionAt('+1-3', 0, Math.random, { preserveSignPrefix: true }) === '-2');
  assert(tryEvaluateExpressionAt('*+1d6', 0, seqRng([0.99]), { preserveSignPrefix: true }) === '+6');
  assert(tryEvaluateExpressionAt('*10+2', 1) === '12');
  assert(tryEvaluateExpressionAt('15', 0) === null);
  assert(tryEvaluateExpressionAt('Claw +1d6+2 slash', 6, seqRng([0])) === 'Claw 3 slash');
  assert(tryEvaluateExpressionAt('Claw +1d6 + 2 slash', 6, seqRng([0])) === 'Claw 3 slash');
  assert(tryEvaluateExpressionAt('plain text', 3) === null);

  assert(resolveStarExpressions('*+1d6', seqRng([0]), true) === '+1');
  assert(resolveStarExpressions('*+1d6', seqRng([0]), false) === '1');

  // unused var silence
  void rng;

  console.log('statExpression.test.ts: ok');
}

runTests();
