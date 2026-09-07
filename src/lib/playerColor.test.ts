/**
 * Run with: npx tsx src/lib/playerColor.test.ts
 */
import {
  colorFromHue,
  defaultPlayerColor,
  hueForPlayerName,
  playerNameInputColors,
  sessionPlayerHue,
  snapHue,
} from './playerColor';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

{
  // Active drawHue wins even when a display name is set.
  const hue = snapHue(120);
  assert(defaultPlayerColor('Alice', hue) === colorFromHue(hue));
  assert(sessionPlayerHue('Alice', hue) === hue);
  assert(playerNameInputColors('Alice', hue).outlineColor === colorFromHue(hue));
}

{
  // Name still seeds a stable default hue (used when the name is applied).
  const a = hueForPlayerName('Alice');
  const b = hueForPlayerName('Alice');
  const c = hueForPlayerName('Bob');
  assert(a === b);
  assert(a !== c);
}

console.log('playerColor.test.ts: ok');
