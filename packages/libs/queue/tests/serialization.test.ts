import { describe, expect, it } from 'vitest';
import {
  decodeQueueMessage,
  encodeQueueMessage,
} from '../src/serialization.js';

describe('versioned queue JSON envelope', () => {
  it.each([
    null,
    undefined,
    '\u0000',
    '\ud800',
    { version: 2, payload: 'business' },
    [1, undefined],
    { date: new Date('2020-01-01') },
  ])('round-trips normalized message %j', (message) => {
    const envelope = encodeQueueMessage(message);
    expect(envelope.version).toBe(1);
    expect(typeof envelope.payload).toBe('string');
    expect(decodeQueueMessage(envelope)).toEqual(
      JSON.parse(JSON.stringify(message === undefined ? {} : message)),
    );
  });

  it('calls a user toJSON exactly once', () => {
    let calls = 0;
    const envelope = encodeQueueMessage({
      toJSON: () => {
        calls++;
        return { calls };
      },
    });
    expect(decodeQueueMessage(envelope)).toEqual({ calls: 1 });
    expect(calls).toBe(1);
  });

  it.each([1n, Symbol('invalid'), () => {}])(
    'rejects roots without JSON text %s',
    (message) => {
      expect(() => encodeQueueMessage(message)).toThrow(/JSON|BigInt/u);
    },
  );

  it.each([
    null,
    {},
    { version: 2, payload: '{}' },
    { version: 1, payload: 5 },
    { version: 1, payload: '{broken' },
    { version: 1, payload: '{}', extra: true },
  ])('rejects malformed envelopes %j', (envelope) => {
    expect(() => decodeQueueMessage(envelope)).toThrow(/envelope|JSON/u);
  });
});
