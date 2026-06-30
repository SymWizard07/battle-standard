import {
  readPageToExtensionPayload,
  wrapExtensionReply,
} from '../../protocol/messages.js';
import type { ExtensionToHostMessage, HostToExtensionMessage } from '../../protocol/messages.js';
import {
  hostResponsesToPageMessage,
  NATIVE_HOST_NAME,
  pageMessageToHostPlan,
  runHostSequence,
} from './bridge.js';

const HOST_TIMEOUT_MS = 60_000;
const CHOOSE_FOLDER_TIMEOUT_MS = 5 * 60_000;

function nativeHostError(err: unknown): string {
  const base = err instanceof Error ? err.message : 'Native host unavailable';
  const id = chrome.runtime.id;
  return id ? `${base} (extension id: ${id})` : base;
}

/** One-shot native request — more reliable on Firefox background scripts than connectNative. */
function sendNativeHostMessage(
  message: ExtensionToHostMessage,
  timeoutMs: number = HOST_TIMEOUT_MS,
): Promise<HostToExtensionMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Native host timeout'));
    }, timeoutMs);

    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || typeof response !== 'object') {
          reject(new Error('Empty native host response'));
          return;
        }
        resolve(response as HostToExtensionMessage);
      });
    } catch (err) {
      clearTimeout(timeout);
      reject(err instanceof Error ? err : new Error('Native host unavailable'));
    }
  });
}

function createHostPort(): chrome.runtime.Port {
  const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  return port;
}

function sendOne(port: chrome.runtime.Port, message: ExtensionToHostMessage): Promise<HostToExtensionMessage> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      port.disconnect();
      reject(new Error('Native host timeout'));
    }, HOST_TIMEOUT_MS);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      fn();
    };

    const onMessage = (response: HostToExtensionMessage) => {
      finish(() => resolve(response));
    };

    const onDisconnect = () => {
      finish(() => {
        const errMsg = chrome.runtime.lastError?.message ?? 'Native host disconnected';
        reject(new Error(errMsg));
      });
    };

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    port.postMessage(message);
  });
}

/** Keep native port open; run a save sequence. */
export async function withNativeSession<T>(
  run: (send: (message: ExtensionToHostMessage) => Promise<HostToExtensionMessage>) => Promise<T>,
): Promise<T> {
  const port = createHostPort();
  const send = (message: ExtensionToHostMessage) => sendOne(port, message);
  try {
    return await run(send);
  } finally {
    port.disconnect();
  }
}

/** Load sessions may stream multiple host messages for one begin request. */
export async function withNativeLoadSession(
  begin: ExtensionToHostMessage,
): Promise<HostToExtensionMessage[]> {
  const port = createHostPort();
  const responses: HostToExtensionMessage[] = [];

  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      port.disconnect();
      reject(new Error('Native host timeout'));
    }, HOST_TIMEOUT_MS);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    port.onMessage.addListener((message: HostToExtensionMessage) => {
      responses.push(message);
      if (
        message.type === 'error' ||
        message.type === 'loadCampaignComplete' ||
        message.type === 'loadGlobalComplete'
      ) {
        finish(() => {
          port.disconnect();
          if (message.type === 'error') reject(new Error(message.error));
          else resolve(responses);
        });
      }
    });

    port.onDisconnect.addListener(() => {
      finish(() => {
        if (responses.length === 0) {
          const errMsg = chrome.runtime.lastError?.message ?? 'Native host disconnected';
          reject(new Error(errMsg));
        }
      });
    });

    port.postMessage(begin);
  });
}

async function dispatchPageMessage(requestId: string, payload: ReturnType<typeof pageMessageToHostPlan>) {
  if (!payload) {
    return wrapExtensionReply({
      type: 'error',
      requestId,
      error: 'Unsupported message type',
    });
  }

  try {
    if (payload.mode === 'single') {
      const timeoutMs =
        payload.message.type === 'chooseSaveFolder' ? CHOOSE_FOLDER_TIMEOUT_MS : HOST_TIMEOUT_MS;
      const response = await sendNativeHostMessage(payload.message, timeoutMs);
      return wrapExtensionReply(hostResponsesToPageMessage(requestId, [response]));
    }

    if (payload.mode === 'save') {
      const responses = await withNativeSession(async (send) => runHostSequence(send, payload.messages));
      return wrapExtensionReply(hostResponsesToPageMessage(requestId, responses));
    }

    const responses = await withNativeLoadSession(payload.begin);
    return wrapExtensionReply(hostResponsesToPageMessage(requestId, responses));
  } catch (err: unknown) {
    return wrapExtensionReply({ type: 'error', requestId, error: nativeHostError(err) });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const payload = readPageToExtensionPayload(message);
  if (!payload) return;

  const plan = pageMessageToHostPlan(payload);
  void dispatchPageMessage(payload.requestId, plan).then(sendResponse);

  return true;
});

export {};
