/**
 * Chrome/Firefox native messaging stdio framing:
 * 4-byte little-endian length prefix + UTF-8 JSON body.
 */

export function encodeNativeMessage(payload: unknown): Buffer {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export function createNativeMessageDecoder(): {
  push(chunk: Buffer): unknown[];
  reset: () => void;
} {
  let buffer = Buffer.alloc(0);

  function reset() {
    buffer = Buffer.alloc(0);
  }

  function push(chunk: Buffer): unknown[] {
    buffer = Buffer.concat([buffer, chunk]);
    const messages: unknown[] = [];

    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) break;
      const body = buffer.subarray(4, 4 + length);
      buffer = buffer.subarray(4 + length);
      messages.push(JSON.parse(body.toString('utf8')));
    }

    return messages;
  }

  return { push, reset };
}
