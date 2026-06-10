import {
  joinNamedRoom,
  leaveRoom,
  type PresencePayload,
} from '../net/trysteroRoom';

const PROBE_TIMEOUT_MS = 6000;

function isValidCampaignJson(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as { id?: unknown };
    return typeof parsed?.id === 'string';
  } catch {
    return false;
  }
}

function isGmPresence(payload: PresencePayload): boolean {
  return payload.role === 'gm';
}

/**
 * Ephemeral join to detect whether a GM is hosting the room.
 * Resolves true on GM presence or valid campaign JSON within the timeout.
 */
export function probeRoomHosted(roomCode: string): Promise<boolean> {
  const topic = roomCode.trim().toUpperCase();
  if (!topic) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (found: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void leaveRoom().then(() => resolve(found));
    };

    const timeout = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);

    void joinNamedRoom(topic, {
      onPresence: (payload) => {
        if (isGmPresence(payload)) finish(true);
      },
      onCampaign: (json) => {
        if (isValidCampaignJson(json)) finish(true);
      },
      onPeerJoin: () => {
        // Peer connected; wait briefly for presence/campaign from GM.
      },
    });
  });
}
