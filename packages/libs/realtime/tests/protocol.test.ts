import { describe, expect, it } from 'vitest';

import {
  parseRealtimeClientMessage,
  parseRealtimeServerMessage,
  RealtimeProtocolError,
} from '../src/protocol.js';

describe('realtime protocol', () => {
  it('parses client and server messages through one contract', () => {
    expect(
      parseRealtimeClientMessage(
        JSON.stringify({ type: 'subscribe', topic: 'notifications:in-app' }),
      ),
    ).toEqual({
      type: 'subscribe',
      topic: 'notifications:in-app',
    });
    expect(
      parseRealtimeServerMessage(
        JSON.stringify({
          type: 'event',
          topic: 'notifications:in-app',
          payload: { changed: true },
          publishedAt: '2026-08-26T00:00:00.000Z',
        }),
      ),
    ).toMatchObject({
      type: 'event',
      topic: 'notifications:in-app',
      payload: { changed: true },
    });
  });

  it.each([
    ['invalid JSON', '{', 'INVALID_JSON'],
    [
      'invalid topic',
      JSON.stringify({ type: 'subscribe', topic: '../private' }),
      'INVALID_TOPIC',
    ],
    [
      'unknown type',
      JSON.stringify({ type: 'unknown' }),
      'UNKNOWN_MESSAGE_TYPE',
    ],
  ])('rejects %s', (_label, data, code) => {
    expect(() => parseRealtimeClientMessage(data)).toThrowError(
      expect.objectContaining({ code }) as RealtimeProtocolError,
    );
  });
});
