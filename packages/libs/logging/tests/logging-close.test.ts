import { EventEmitter } from 'node:events';

import { symbols, type DestinationStream } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Logging transport shutdown', () => {
  afterEach(() => {
    vi.doUnmock('../src/logger.js');
    vi.resetModules();
  });

  it('settles when a transport finishes before it closes', async () => {
    const stream = createFinishingTransport();
    const logger = {
      [symbols.streamSym]: stream,
      child: vi.fn().mockReturnThis(),
    };
    vi.doMock('../src/logger.js', () => ({
      createLogger: vi.fn(() => logger),
    }));
    const { createLogging } = await import('../src/logging.js');
    const logging = createLogging({
      transport: { target: 'test-transport' },
    });

    logging.getLogger();

    await expect(logging.close()).resolves.toBeUndefined();
    expect(stream.listenerCount('close')).toBe(0);
    expect(stream.listenerCount('error')).toBe(0);
    expect(stream.listenerCount('finish')).toBe(0);
  });
});

type FinishingTransport = DestinationStream &
  EventEmitter & {
    writableFinished: boolean;
    end(): void;
  };

function createFinishingTransport(): FinishingTransport {
  const stream = new EventEmitter() as FinishingTransport;
  stream.writableFinished = false;
  stream.write = (): boolean => true;
  stream.end = (): void => {
    stream.writableFinished = true;
    stream.emit('finish');
  };
  return stream;
}
