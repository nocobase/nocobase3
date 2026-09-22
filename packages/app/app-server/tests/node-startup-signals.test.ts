import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import {
  watchStartupShutdownSignals,
  type NodeAppServerLogger,
} from '../src/node/index.js';

function collectingLogger(): NodeAppServerLogger & {
  readonly messages: string[];
} {
  const messages: string[] = [];
  return {
    messages,
    error: (message: string): void => {
      messages.push(message);
    },
  };
}

describe('watchStartupShutdownSignals', () => {
  it('records the signal and lets startup finish instead of exiting', () => {
    const emitter = new EventEmitter();
    const logger = collectingLogger();
    const exits: number[] = [];
    const watch = watchStartupShutdownSignals({
      emitter,
      logger,
      forceExit: (code) => exits.push(code),
    });

    expect(watch.received()).toBeUndefined();
    emitter.emit('SIGTERM');

    // The startup task holding the lock has to run to completion for the lock
    // to be released, so a first signal must not terminate the process.
    expect(watch.received()).toBe('SIGTERM');
    expect(exits).toEqual([]);
    expect(logger.messages).toEqual([
      'Received SIGTERM while the app server was starting; finishing startup tasks before shutting down.',
    ]);

    watch.dispose();
  });

  it('keeps the first signal when a second one arrives, and forces the exit', () => {
    const emitter = new EventEmitter();
    const logger = collectingLogger();
    const exits: number[] = [];
    const watch = watchStartupShutdownSignals({
      emitter,
      logger,
      forceExit: (code) => exits.push(code),
    });

    emitter.emit('SIGINT');
    emitter.emit('SIGTERM');

    expect(watch.received()).toBe('SIGINT');
    expect(exits).toEqual([1]);
    expect(logger.messages[1]).toBe(
      'Received SIGTERM again while the app server was still starting; forcing exit.',
    );

    watch.dispose();
  });

  it('stops listening once the HTTP server owns the signals', () => {
    const emitter = new EventEmitter();
    const watch = watchStartupShutdownSignals({
      emitter,
      logger: collectingLogger(),
      forceExit: () => undefined,
    });

    watch.dispose();
    emitter.emit('SIGTERM');

    expect(watch.received()).toBeUndefined();
    expect(emitter.listenerCount('SIGTERM')).toBe(0);
    expect(emitter.listenerCount('SIGINT')).toBe(0);
  });
});
