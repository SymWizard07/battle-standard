import type { SessionRole } from '../lib/types';

const STORAGE_KEY = 'battle-map-session';
const PENDING_JOIN_KEY = 'battle-map-pending-join';
export const SESSION_TTL_MS = 5 * 60 * 1000;

export type PendingJoin = {
  roomCode: string;
  playerName: string;
  campaignId: string;
  /** Set when the home page already verified a host is present. */
  hostVerified?: boolean;
};

export type SavedSession = {
  roomCode: string;
  role: SessionRole;
  playerName: string;
  campaignId: string;
  expiresAt: number;
};

export function isSessionValid(session: SavedSession | null): session is SavedSession {
  if (!session) return false;
  return Date.now() < session.expiresAt;
}

export function saveSession(session: Omit<SavedSession, 'expiresAt'>): void {
  const saved: SavedSession = {
    ...session,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // sessionStorage unavailable or full
  }
}

export function refreshSessionExpiry(): void {
  const session = loadSessionRaw();
  if (!session) return;
  saveSession({
    roomCode: session.roomCode,
    role: session.role,
    playerName: session.playerName,
    campaignId: session.campaignId,
  });
}

export function loadSession(campaignId: string): SavedSession | null {
  const session = loadSessionRaw();
  if (!isSessionValid(session)) {
    clearSession();
    return null;
  }
  if (session.campaignId !== campaignId) return null;
  return session;
}

function loadSessionRaw(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function savePendingJoin(pending: PendingJoin): void {
  try {
    sessionStorage.setItem(PENDING_JOIN_KEY, JSON.stringify(pending));
  } catch {
    // ignore
  }
}

export function consumePendingJoin(campaignId: string): PendingJoin | null {
  try {
    const raw = sessionStorage.getItem(PENDING_JOIN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_JOIN_KEY);
    const pending = JSON.parse(raw) as PendingJoin;
    if (pending.campaignId !== campaignId) return null;
    return pending;
  } catch {
    return null;
  }
}
