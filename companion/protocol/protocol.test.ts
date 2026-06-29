/**
 * Run: npm run companion:test
 */
import {
  COMPANION_MESSAGE_SOURCE,
  COMPANION_PROTOCOL_VERSION,
  NATIVE_HOST_NAME,
} from './constants.js';
import {
  isCompanionExtensionEnvelope,
  isExtensionToPageMessage,
  isPageToExtensionMessage,
} from './messages.js';
import { createNativeMessageDecoder, encodeNativeMessage } from './nativeMessaging.js';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
  }
}

function testEncodeDecodeRoundTrip() {
  const payload = { type: 'ping', protocolVersion: COMPANION_PROTOCOL_VERSION };
  const encoded = encodeNativeMessage(payload);
  assert(encoded.length >= 4);

  const decoder = createNativeMessageDecoder();
  const partial = encoded.subarray(0, 2);
  assertEqual(decoder.push(partial).length, 0);

  const rest = encoded.subarray(2);
  const decoded = decoder.push(rest);
  assertEqual(decoded.length, 1);
  assertEqual(JSON.stringify(decoded[0]), JSON.stringify(payload));
}

function testConstants() {
  assert(NATIVE_HOST_NAME.includes('battlestandard'));
  assertEqual(COMPANION_MESSAGE_SOURCE, 'battle-standard-companion');
  assertEqual(COMPANION_PROTOCOL_VERSION, 2);
}

function testExtensionReplyGuards() {
  const request = { type: 'getStatus', requestId: 'req-1' };
  const reply = {
    type: 'status',
    requestId: 'req-1',
    connected: true,
    saveFolder: null,
    hostVersion: '0.1.0',
    error: null,
  };

  assert(isPageToExtensionMessage(request));
  assert(!isExtensionToPageMessage(request));

  assert(isExtensionToPageMessage(reply));
  assert(
    !isCompanionExtensionEnvelope({
      source: COMPANION_MESSAGE_SOURCE,
      payload: request,
    }),
  );
  assert(
    isCompanionExtensionEnvelope({
      source: COMPANION_MESSAGE_SOURCE,
      payload: reply,
    }),
  );
}

function runTests() {
  testEncodeDecodeRoundTrip();
  testConstants();
  testExtensionReplyGuards();
  console.log('companion protocol tests passed');
}

runTests();
