/** Fixed draw/player color saturation and lightness — hue is the only variable. */
export const DRAW_SATURATION = 76;
export const DRAW_LIGHTNESS = 52;

export const HUE_SLOT_COUNT = 24;
export const HUE_STEP_DEG = 360 / HUE_SLOT_COUNT;

const DEFAULT_HUE = 0;

/** FNV-1a 32-bit — fast, stable string digest used as the name seed. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Avalanche mix (SplitMix32-style) so tiny seed changes flip many output bits. */
function mix32(x: number): number {
  let v = x >>> 0;
  v ^= v >>> 16;
  v = Math.imul(v, 0x7feb352d);
  v ^= v >>> 15;
  v = Math.imul(v, 0x846ca68b);
  v ^= v >>> 16;
  return v >>> 0;
}

function seedFromPlayerName(name: string): number {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return 0;

  let seed = fnv1a(normalized);
  for (let i = 0; i < normalized.length; i++) {
    seed = mix32(seed ^ Math.imul(normalized.charCodeAt(i)!, (i + 1) * 0x9e3779b1));
  }
  seed = mix32(seed ^ fnv1a(normalized.split('').reverse().join('')));
  seed = mix32(seed ^ Math.imul(normalized.length, 0x9e3779b1));
  seed = mix32(
    seed ^
      Math.imul(normalized.charCodeAt(0) ?? 0, 0x85ebca6b) ^
      (normalized.charCodeAt(normalized.length - 1) ?? 0),
  );
  return seed;
}

export function hueFromSlot(slot: number): number {
  const n = ((slot % HUE_SLOT_COUNT) + HUE_SLOT_COUNT) % HUE_SLOT_COUNT;
  return n * HUE_STEP_DEG;
}

export function hueSlotIndex(hue: number): number {
  return Math.round(((hue % 360) + 360) % 360 / HUE_STEP_DEG) % HUE_SLOT_COUNT;
}

export function snapHue(hue: number): number {
  return hueFromSlot(hueSlotIndex(hue));
}

export function clampHueSlot(slot: number): number {
  return Math.max(0, Math.min(HUE_SLOT_COUNT - 1, Math.round(slot)));
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toByte = (v: number) =>
    Math.round(Math.min(255, Math.max(0, (v + m) * 255)))
      .toString(16)
      .padStart(2, '0');

  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

export function colorFromHue(hue: number): string {
  return hslToHex(snapHue(hue), DRAW_SATURATION, DRAW_LIGHTNESS);
}

/** CSS linear-gradient stops for a hue slider (one stop per slot). */
export function hueSliderGradient(): string {
  const stops = Array.from({ length: HUE_SLOT_COUNT }, (_, i) => colorFromHue(hueFromSlot(i)));
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** Stable hue slot from a display name (same name → same hue). */
export function hueForPlayerName(name: string): number {
  const normalized = name.trim();
  if (!normalized) return DEFAULT_HUE;
  const seed = seedFromPlayerName(normalized);
  return hueFromSlot(mix32(seed) % HUE_SLOT_COUNT);
}

/** Stable draw color for a display name. */
export function colorForPlayerName(name: string): string {
  return colorFromHue(hueForPlayerName(name));
}

/** Draw/measure color for the current session user (name-based, else active draw hue). */
export function defaultPlayerColor(playerName: string, drawHue: number): string {
  if (playerName.trim()) {
    return colorForPlayerName(playerName);
  }
  return colorFromHue(drawHue);
}

/** Hue used for the current session user's draw/measure/name preview. */
export function sessionPlayerHue(playerName: string, drawHue: number): number {
  return playerName.trim() ? hueForPlayerName(playerName) : snapHue(drawHue);
}

const NAME_INPUT_BG_SATURATION = 38;
const NAME_INPUT_BG_LIGHTNESS = 20;

/** Outline = full player color; background = same hue, lower saturation. */
export function playerNameInputColors(
  playerName: string,
  drawHue: number,
): { outlineColor: string; backgroundColor: string } {
  const hue = sessionPlayerHue(playerName, drawHue);
  return {
    outlineColor: hslToHex(hue, DRAW_SATURATION, DRAW_LIGHTNESS),
    backgroundColor: hslToHex(hue, NAME_INPUT_BG_SATURATION, NAME_INPUT_BG_LIGHTNESS),
  };
}
