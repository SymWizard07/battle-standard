import { isTokenCompletelyHiddenFromPlayer } from './playerFogHit';
import type { FogState, Point, Scene, Token } from './types';

/** Opacity for GM-view tokens hidden from players. */
export const GM_HIDDEN_TOKEN_OPACITY = 0.35;

export function isTokenVisibleToPlayers(token: { visibleToPlayers?: boolean }): boolean {
  return token.visibleToPlayers !== false;
}

export function isTokenLockedForPlayers(token: { lockedForPlayers?: boolean }): boolean {
  return token.lockedForPlayers === true;
}

export function filterTokensForViewer(tokens: Token[], asPlayer: boolean): Token[] {
  if (!asPlayer) return tokens;
  return tokens.filter(isTokenVisibleToPlayers);
}

export function isTokenSelectableByPlayer(
  token: Pick<Token, 'visibleToPlayers' | 'gridPos' | 'posOffset' | 'footprint'>,
  fog: FogState,
  scene: Scene | null,
  gridOffset: Point,
): boolean {
  if (!isTokenVisibleToPlayers(token)) return false;
  return !isTokenCompletelyHiddenFromPlayer(token, fog, scene, gridOffset);
}
