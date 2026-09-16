// @vitest-environment node

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveWatchEnvironment } from '../../scripts/dev/watch-environment.mjs';

afterEach(() => vi.restoreAllMocks());

function mockNativeWatch(errorCode?: string) {
  const watcher = Object.assign(new EventEmitter(), {
    close: vi.fn(),
    ref() {
      return this;
    },
    unref() {
      return this;
    },
  });
  vi.spyOn(fs, 'watch').mockImplementation((_directory, listener) => {
    setImmediate(() => {
      if (errorCode)
        watcher.emit(
          'error',
          Object.assign(new Error(errorCode), { code: errorCode }),
        );
      else if (typeof listener === 'function') listener('change', 'probe');
    });
    return watcher;
  });
  return watcher;
}

describe('development watch environment', () => {
  it('keeps native watching and annotations when file events work', async () => {
    const watcher = mockNativeWatch();
    const env = { AGENT_ANNOTATIONS_ENABLED: 'true' };
    expect(await resolveWatchEnvironment(env)).toBe(env);
    expect(watcher.close).toHaveBeenCalledOnce();
  });

  it.each(['EMFILE', 'ENFILE', 'ENOSPC', 'ENOSYS'])(
    'falls back after an asynchronous %s without changing the parent environment',
    async (code) => {
      const watcher = mockNativeWatch(code);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const env = {
        APP_SERVER_PORT: '13000',
        AGENT_ANNOTATIONS_ENABLED: 'true',
      };
      expect(await resolveWatchEnvironment(env)).toEqual({
        APP_SERVER_PORT: '13000',
        AGENT_ANNOTATIONS_ENABLED: 'false',
        CHOKIDAR_USEPOLLING: 'true',
        CHOKIDAR_INTERVAL: '300',
      });
      expect(env.AGENT_ANNOTATIONS_ENABLED).toBe('true');
      expect(watcher.close).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(code));
    },
  );

  it('honors explicit polling without opening a native watcher', async () => {
    const watch = vi.spyOn(fs, 'watch');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await resolveWatchEnvironment({
        CHOKIDAR_USEPOLLING: 'true',
        CHOKIDAR_INTERVAL: '500',
      }),
    ).toMatchObject({
      CHOKIDAR_USEPOLLING: 'true',
      CHOKIDAR_INTERVAL: '500',
      AGENT_ANNOTATIONS_ENABLED: 'false',
    });
    expect(watch).not.toHaveBeenCalled();
  });

  it('does not hide unrelated watcher errors', async () => {
    const watcher = mockNativeWatch('EACCES');
    await expect(resolveWatchEnvironment({})).rejects.toMatchObject({
      code: 'EACCES',
    });
    expect(watcher.close).toHaveBeenCalledOnce();
  });
});
