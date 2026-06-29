import type { SessionRole } from '../lib/types';

/** GM merged remote campaign into local state — schedule IndexedDB/disk persist. */
export function shouldPersistAfterRemoteMerge(role: SessionRole, skipped: boolean): boolean {
  return role === 'gm' && !skipped;
}

/** GM leaving session — flush persist so merged multiplayer state is saved. */
export function shouldFlushPersistOnDisconnect(
  role: SessionRole,
  hasCampaign: boolean,
): boolean {
  return role === 'gm' && hasCampaign;
}
