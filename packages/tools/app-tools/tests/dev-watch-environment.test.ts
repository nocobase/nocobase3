import { afterEach, expect, it, vi } from 'vitest';
import { resolveWatchEnvironment } from '../src/scripts/dev/watch-environment.mjs';

afterEach(() => vi.restoreAllMocks());

it.each([undefined, 'false', '0'])(
  'preserves native watching and annotations for polling=%s',
  (polling) => {
    const env = {
      CHOKIDAR_USEPOLLING: polling,
      AGENT_ANNOTATIONS_ENABLED: 'true',
    };
    expect(resolveWatchEnvironment(env)).toBe(env);
  },
);

it.each(['true', '1'])(
  'honors explicitly requested polling=%s without mutating the input',
  (polling) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = {
      CHOKIDAR_USEPOLLING: polling,
      CHOKIDAR_INTERVAL: '500',
      AGENT_ANNOTATIONS_ENABLED: 'true',
    };
    expect(resolveWatchEnvironment(env)).toEqual({
      CHOKIDAR_USEPOLLING: 'true',
      CHOKIDAR_INTERVAL: '500',
      AGENT_ANNOTATIONS_ENABLED: 'false',
    });
    expect(env.AGENT_ANNOTATIONS_ENABLED).toBe('true');
  },
);
