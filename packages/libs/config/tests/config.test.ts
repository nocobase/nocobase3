import { describe, expect, it } from 'vitest';

import { Config, ConfigMergeError, ConfigPathError } from '../src/index.js';
import { objectProvider } from '../src/providers/object.js';

describe('Config', () => {
  it('loads and recursively merges providers in order', async () => {
    const config = new Config();
    await config.load(
      objectProvider({
        server: { host: '127.0.0.1', port: 3000 },
        transports: ['console'],
      }),
    );
    await config.load(
      objectProvider({
        server: { port: 4000 },
        transports: ['file'],
      }),
    );

    expect(config.raw()).toEqual({
      server: { host: '127.0.0.1', port: 4000 },
      transports: ['file'],
    });
    expect(config.integer('server.port')).toBe(4000);
    expect(config.keys()).toEqual([
      'server',
      'server.host',
      'server.port',
      'transports',
    ]);
  });

  it('supports set, delete, cut, mergeAt, and defensive reads', () => {
    const config = new Config({}, { app: { port: 3000 }, empty: {} });
    config.set('app.host', 'localhost');
    config.delete('app.port');

    const raw = config.raw() as { app: { host: string } };
    raw.app.host = 'mutated';
    expect(config.string('app.host')).toBe('localhost');
    expect(config.has('empty')).toBe(true);

    const logging = new Config({}, { level: 'debug' });
    config.mergeAt(logging, 'logging');
    expect(config.cut('logging').string('level')).toBe('debug');
  });

  it('rejects type changes in strict merge mode', async () => {
    const config = new Config({ strictMerge: true });
    await config.load(objectProvider({ server: { port: 3000 } }));

    await expect(
      config.load(objectProvider({ server: { port: '3000' } })),
    ).rejects.toBeInstanceOf(ConfigMergeError);
  });

  it('rejects unsafe paths and values', () => {
    const config = new Config();
    expect(() => config.set('__proto__.polluted', true)).toThrow(
      ConfigPathError,
    );
    expect(() => config.set('date', new Date() as never)).toThrow(
      ConfigPathError,
    );
  });
});
