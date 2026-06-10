import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

export const SIGNALING = [
  'wss://signaling.yjs.dev',
  'wss://y-webrtc-signaling.herokuapp.com',
];

const PROBE_TIMEOUT_MS = 6000;

/** GM seeds these in wireGmSync before any player can legitimately join. */
export function docHasGmHostData(activeDoc: Y.Doc): boolean {
  const metaMap = activeDoc.getMap('meta');
  if (metaMap.get('host')) return true;
  const campaignMap = activeDoc.getMap('campaign');
  if (campaignMap.get('json')) return true;
  return false;
}

/**
 * Probe for a hosted session using the same WebrtcProvider stack as a real join.
 * Raw WebSocket signaling alone does not connect reliably in this environment.
 */
export function probeRoomHosted(roomCode: string): Promise<boolean> {
  const topic = roomCode.trim().toUpperCase();
  if (!topic) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const probeDoc = new Y.Doc();
    const provider = new WebrtcProvider(topic, probeDoc, {
      signaling: SIGNALING,
      maxConns: 5,
    });

    const finish = (found: boolean, _reason: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      provider.destroy();
      probeDoc.destroy();
      resolve(found);
    };

    const check = () => {
      if (docHasGmHostData(probeDoc)) finish(true, 'gm-data');
    };

    probeDoc.getMap('meta').observe(check);
    probeDoc.getMap('campaign').observe(check);

    provider.on('peers', () => {
      check();
    });

    const timeout = setTimeout(() => finish(false, 'timeout'), PROBE_TIMEOUT_MS);
  });
}
