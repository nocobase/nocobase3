import { Type } from '@sinclair/typebox';
import { objectProvider } from '@nocobase/config/providers/object';
import { describe, expect, it, vi } from 'vitest';

import {
  AppConfig,
  defineAppConfig,
  defineAppConfigVariant,
  envBoolean,
  envInteger,
} from '../src/config/index.js';

const featureConfig = defineAppConfig({
  namespace: 'feature',
  schema: Type.Object({
    enabled: Type.Boolean(),
    label: Type.String(),
  }),
  defaults: { enabled: false, label: 'default' },
  envMappings: { FEATURE_LABEL: { path: 'label' } },
});

describe('AppConfig', () => {
  it('logs successful loads and reloads without configuration values', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const config = new AppConfig([featureConfig]);
      await config.loadAll();
      expect(info).toHaveBeenCalledWith('App configuration loaded', {
        durationMs: expect.any(Number),
      });
      info.mockClear();
      await Promise.all([config.reload(), config.reload()]);
      expect(info).toHaveBeenCalledExactlyOnceWith(
        'App configuration reloaded',
        {
          changedNamespaces: [],
          durationMs: expect.any(Number),
        },
      );
    } finally {
      info.mockRestore();
    }
  });

  it('loads YAML and JSON files according to their extension', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-app-config-'));
    try {
      const yamlPath = path.join(directory, 'config.yaml');
      const jsonPath = path.join(directory, 'config.json');
      writeFileSync(yamlPath, 'feature:\n  enabled: true\n');
      writeFileSync(jsonPath, JSON.stringify({ feature: { label: 'json' } }));
      const config = new AppConfig([featureConfig], { context: {} });

      config.loadFile(yamlPath).loadFile(jsonPath);
      await config.loadAll();

      expect(config.get(featureConfig)).toEqual({
        enabled: true,
        label: 'json',
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('discovers a supported config file when the path has no extension', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-app-config-'));
    try {
      writeFileSync(
        path.join(directory, 'config.json'),
        JSON.stringify({ feature: { enabled: true, label: 'discovered' } }),
      );
      const config = new AppConfig([featureConfig], { context: {} });

      config.loadFile(path.join(directory, 'config'));
      await config.loadAll();

      expect(config.get(featureConfig).label).toBe('discovered');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('prefers yml, yaml, then json for extensionless config paths', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nocobase-app-config-'));
    try {
      writeFileSync(
        path.join(directory, 'config.yml'),
        'feature:\n  enabled: true\n  label: yml\n',
      );
      writeFileSync(
        path.join(directory, 'config.json'),
        JSON.stringify({ feature: { enabled: true, label: 'json' } }),
      );
      const config = new AppConfig([featureConfig], { context: {} });

      config.loadFile(path.join(directory, 'config'));
      await config.loadAll();

      expect(config.get(featureConfig).label).toBe('yml');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects unsupported config file extensions', () => {
    const config = new AppConfig([featureConfig], { context: {} });

    expect(() => config.loadFile('config.toml')).toThrow(
      /Expected \.yml, \.yaml, or \.json/,
    );
  });

  it('merges defaults, loaded providers, and definition env layers', async () => {
    const config = new AppConfig([featureConfig], {
      context: {},
      environment: { FEATURE_LABEL: 'environment' },
    });
    config.load(objectProvider({ feature: { enabled: true } }));
    await config.loadAll();

    expect(config.get(featureConfig)).toEqual({
      enabled: true,
      label: 'environment',
    });
    expect(config.get<boolean>('feature.enabled')).toBe(true);
    expect(config.get('feature.missing')).toBeUndefined();
  });

  it('rejects duplicate namespaces before loading', () => {
    expect(
      () =>
        new AppConfig([featureConfig, { ...featureConfig }], { context: {} }),
    ).toThrow(/registered more than once/);
  });

  it('validates record entries with contributed config variants', async () => {
    const cachingConfig = defineAppConfig({
      namespace: 'caching',
      schema: Type.Object({
        providers: Type.Record(
          Type.String(),
          Type.Object(
            { driver: Type.String() },
            { additionalProperties: true },
          ),
        ),
      }),
      defaults: { providers: {} },
    });
    const redisConfig = defineAppConfigVariant({
      target: 'caching.providers',
      discriminator: 'driver',
      value: 'redis',
      schema: Type.Object(
        {
          driver: Type.Literal('redis'),
          url: Type.String({ format: 'uri' }),
          database: Type.Optional(Type.Integer({ minimum: 0 })),
        },
        { additionalProperties: false },
      ),
    });
    const config = new AppConfig([cachingConfig, redisConfig], {
      context: {},
    });
    config.load(
      objectProvider({
        caching: {
          providers: {
            primary: {
              driver: 'redis',
              url: 'redis://localhost:6379',
              database: 1,
            },
          },
        },
      }),
    );

    await config.loadAll();

    expect(config.get('caching.providers.primary')).toEqual({
      driver: 'redis',
      url: 'redis://localhost:6379',
      database: 1,
    });
  });

  it('rejects missing, unknown, duplicate, and invalid config variants', async () => {
    const cachingConfig = defineAppConfig({
      namespace: 'caching',
      schema: Type.Object({
        providers: Type.Record(
          Type.String(),
          Type.Object(
            { driver: Type.String() },
            { additionalProperties: true },
          ),
        ),
      }),
      defaults: { providers: {} },
    });
    const redisConfig = defineAppConfigVariant({
      target: 'caching.providers',
      discriminator: 'driver',
      value: 'redis',
      schema: Type.Object(
        { driver: Type.Literal('redis'), url: Type.String() },
        { additionalProperties: false },
      ),
    });

    expect(
      () =>
        new AppConfig(
          [
            cachingConfig,
            defineAppConfigVariant({ ...redisConfig, target: 'caching' }),
          ],
          { context: {} },
        ),
    ).toThrow(/must be a full config path/);

    expect(() => new AppConfig([redisConfig], { context: {} })).toThrow(
      /target namespace "caching" is not registered/,
    );
    expect(
      () =>
        new AppConfig([cachingConfig, redisConfig, redisConfig], {
          context: {},
        }),
    ).toThrow(/registered more than once/);

    const unknown = new AppConfig([cachingConfig, redisConfig], {
      context: {},
    });
    unknown.load(
      objectProvider({
        caching: { providers: { primary: { driver: 'memcached' } } },
      }),
    );
    await expect(unknown.loadAll()).rejects.toThrow(
      /no variant is registered for "memcached"/,
    );

    const invalid = new AppConfig([cachingConfig, redisConfig], {
      context: {},
    });
    invalid.load(
      objectProvider({
        caching: { providers: { primary: { driver: 'redis' } } },
      }),
    );
    await expect(invalid.loadAll()).rejects.toThrow(
      /caching\.providers\.primary.*required property 'url'/,
    );
  });

  it('loads each new provider once and replays all providers on reload', async () => {
    const firstRead = vi.fn(async () => ({
      kind: 'map' as const,
      value: { feature: { enabled: true } },
    }));
    const secondRead = vi.fn(async () => ({
      kind: 'map' as const,
      value: { feature: { label: 'second' } },
    }));
    const config = new AppConfig([featureConfig], { context: {} });

    config.load({ name: 'first', read: firstRead });
    config.load({ name: 'second', read: secondRead });

    expect(firstRead).not.toHaveBeenCalled();
    expect(secondRead).not.toHaveBeenCalled();

    await config.loadAll();

    expect(firstRead).toHaveBeenCalledOnce();
    expect(secondRead).toHaveBeenCalledOnce();
    expect(config.get(featureConfig)).toEqual({
      enabled: true,
      label: 'second',
    });

    await config.reload();

    expect(firstRead).toHaveBeenCalledTimes(2);
    expect(secondRead).toHaveBeenCalledTimes(2);
  });

  it('reloads atomically and notifies namespace subscribers', async () => {
    let enabled = false;
    const config = new AppConfig([featureConfig], { context: {} });
    config.load({
      name: 'feature',
      read: async () => ({
        kind: 'map',
        value: { feature: { enabled } },
      }),
    });
    await config.loadAll();
    const listener = vi.fn();

    config.subscribe(featureConfig, listener);
    enabled = true;
    const result = await config.reload();

    expect(result).toEqual({ changedNamespaces: ['feature'] });
    expect(config.get(featureConfig).enabled).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      previous: { enabled: false, label: 'default' },
      current: { enabled: true, label: 'default' },
    });
  });

  it('supports unique object properties in contributed array schemas', async () => {
    const servicesConfig = defineAppConfig({
      namespace: 'services',
      schema: Type.Object({
        entries: Type.Array(
          Type.Object({ name: Type.String(), provider: Type.String() }),
          { uniqueItemProperties: ['name'] },
        ),
      }),
      defaults: { entries: [] },
    });
    const config = new AppConfig([servicesConfig], { context: {} });
    config.load(
      objectProvider({
        services: {
          entries: [
            { name: 'same', provider: 'first' },
            { name: 'same', provider: 'second' },
          ],
        },
      }),
    );

    await expect(config.loadAll()).rejects.toThrow(/uniqueItemProperties/);
  });

  it('keeps the previous snapshot when a reload fails validation', async () => {
    let enabled: boolean | string = false;
    const config = new AppConfig([featureConfig], { context: {} });
    config.load({
      name: 'feature',
      read: async () => ({
        kind: 'map',
        value: { feature: { enabled } },
      }),
    });
    await config.loadAll();

    enabled = 'invalid';

    await expect(config.reload()).rejects.toThrow(/Invalid application config/);
    expect(config.get(featureConfig).enabled).toBe(false);
  });

  it('evaluates asynchronous defaults once and reuses them on reload', async () => {
    const defaults = vi.fn(async () => ({
      enabled: false,
      label: 'default',
    }));
    const config = new AppConfig([{ ...featureConfig, defaults }], {
      context: {},
    });

    await config.loadAll();
    await config.reload();

    expect(defaults).toHaveBeenCalledOnce();
  });

  it('keeps validated configuration as plain data', async () => {
    const endpointConfig = defineAppConfig({
      namespace: 'endpoint',
      schema: Type.Object({ url: Type.String({ format: 'uri' }) }),
      defaults: { url: 'https://example.com/api' },
    });
    const config = new AppConfig([endpointConfig], { context: {} });

    await config.loadAll();

    expect(config.get(endpointConfig)).toEqual({
      url: 'https://example.com/api',
    });
    expect(config.get<string>('endpoint.url')).toBe('https://example.com/api');
  });

  it('loads mapped environment values as the highest-priority layer', async () => {
    const serverConfig = defineAppConfig({
      namespace: 'server',
      schema: Type.Object({
        port: Type.Number(),
        enabled: Type.Boolean(),
      }),
      defaults: { port: 13000, enabled: false },
      envMappings: {
        APP_SERVER_PORT: envInteger('port'),
        APP_SERVER_ENABLED: envBoolean('enabled'),
      },
    });
    const config = new AppConfig([serverConfig], {
      context: {},
      environment: {
        APP_SERVER_PORT: '14000',
        APP_SERVER_ENABLED: 'true',
      },
    });
    config.load(objectProvider({ server: { port: 13500 } }));
    await config.loadAll();

    expect(config.get(serverConfig)).toEqual({ port: 14000, enabled: true });
  });
});
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
