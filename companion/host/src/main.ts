#!/usr/bin/env node
/**
 * Battle Standard native messaging host (stdio).
 *
 * Chrome/Firefox spawn this process when the extension calls connectNative().
 * Reads length-prefixed JSON from stdin, writes responses to stdout.
 *
 * Dev: npm run companion:host
 * Register: companion/host/scripts/register-windows.ps1
 */
import { createNativeMessageDecoder, encodeNativeMessage } from '../../protocol/nativeMessaging.js';
import type { ExtensionToHostMessage } from '../../protocol/index.js';
import { handleHostMessage } from './handlers.js';

function isExtensionToHostMessage(value: unknown): value is ExtensionToHostMessage {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as ExtensionToHostMessage).type === 'string';
}

async function main() {
  const decoder = createNativeMessageDecoder();

  process.stdin.on('data', (chunk: Buffer) => {
    const rawMessages = decoder.push(chunk);
    for (const raw of rawMessages) {
      void (async () => {
        if (!isExtensionToHostMessage(raw)) {
          const err = encodeNativeMessage({ type: 'error', error: 'Invalid message shape' });
          process.stdout.write(err);
          return;
        }
        const response = await handleHostMessage(raw);
        const responses = Array.isArray(response) ? response : [response];
        for (const item of responses) {
          process.stdout.write(encodeNativeMessage(item));
        }
      })();
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[battle-map-save-host]', err);
  process.exit(1);
});
