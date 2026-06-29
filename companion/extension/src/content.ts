import {
  coerceExtensionToPageMessage,
  isCompanionPageEnvelope,
  isPageToExtensionMessage,
  wrapExtensionReply,
} from '../../protocol/index.js';

function sendToBackground(payload: { type: string; requestId: string }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Relays window.postMessage ↔ extension background ↔ native host.
 * Page uses src/lib/companion/companionBridge.ts (same envelope shape).
 */
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!isCompanionPageEnvelope(event.data)) return;

  const payload = event.data.payload;
  if (!isPageToExtensionMessage(payload)) return;

  void sendToBackground(payload)
    .then((response) => {
      const reply = coerceExtensionToPageMessage(response);
      if (reply) {
        window.postMessage(wrapExtensionReply(reply), window.location.origin);
        return;
      }
      window.postMessage(
        wrapExtensionReply({
          type: 'error',
          requestId: payload.requestId,
          error: 'Extension did not respond',
        }),
        window.location.origin,
      );
    })
    .catch((err: unknown) => {
      window.postMessage(
        wrapExtensionReply({
          type: 'error',
          requestId: payload.requestId,
          error: err instanceof Error ? err.message : 'Extension error',
        }),
        window.location.origin,
      );
    });
});

export {};
