import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { ServiceContainer } from '@nocobase/service-provider';

import {
  AppConfig,
  createConfigPaths,
  PLACEHOLDER_SECRET,
} from '../src/config/index.js';

import type { AppPluginApplication } from '../src/plugins/index.js';

import {
  SessionProvider,
  resolveAppSessionConfig,
  type AppSessionConfigInput,
  sessionManagerToken,
} from '../src/session/index.js';

describe('SessionProvider', () => {
  it('resolves runtime-only defaults and converts the GC lottery object', async () => {
    const config = await createSessionAppConfig({
      NODE_ENV: 'production',
      SESSION_GC_LOTTERY_HITS: '3',
      SESSION_GC_LOTTERY_TOTAL: '200',
    });
    const container = new ServiceContainer();
    const provider = new SessionProvider(
      createProviderApplication(config, container),
    );

    provider.register();

    const manager = container.resolve(sessionManagerToken);
    expect(manager.config.secret).toHaveLength(43);
    expect(manager.config.cookie.secure).toBe(true);
    expect(manager.config.gcLottery).toEqual([3, 200]);
  });

  it('keeps explicit secrets and secure-cookie settings', () => {
    const configured = createRuntimeConfig({
      secret: 'configured-session-secret-at-least-32-characters',
      cookie: {
        name: 'session',
        secure: false,
      },
      gcLottery: { hits: 1, total: 10 },
    });

    const resolved = resolveAppSessionConfig(configured, 'ephemeral-secret');

    expect(resolved.secret).toBe(
      'configured-session-secret-at-least-32-characters',
    );
    expect(resolved.cookie.secure).toBe(false);
    expect(resolved.gcLottery).toEqual([1, 10]);
  });

  it('rejects a GC lottery whose hits exceed its total', () => {
    const configured = createRuntimeConfig({
      gcLottery: { hits: 2, total: 1 },
    });

    expect(() =>
      resolveAppSessionConfig(configured, 'ephemeral-secret'),
    ).toThrow('session.gcLottery.hits must not exceed');
  });

  /**
   * The placeholder is a non-empty string, so without this it is taken as a configured secret — and it is the same
   * string in every installation that copied `config.example.yml` without editing it.
   */
  it('rejects the secret the example ships', () => {
    const configured = createRuntimeConfig({ secret: PLACEHOLDER_SECRET });

    expect(() =>
      resolveAppSessionConfig(configured, 'ephemeral-secret'),
    ).toThrow('session.secret is still set to the placeholder');
  });

  it('rejects it with surrounding whitespace too', () => {
    const configured = createRuntimeConfig({
      secret: `  ${PLACEHOLDER_SECRET}\n`,
    });

    expect(() =>
      resolveAppSessionConfig(configured, 'ephemeral-secret'),
    ).toThrow('session.secret is still set to the placeholder');
  });
});

async function createSessionAppConfig(
  environment: Readonly<Record<string, string>>,
): Promise<AppConfig> {
  const config = new AppConfig();
  await config.loadAll();
  config.mergeDefaults({
    session: createRuntimeConfig({
      cookie: {
        name: 'session',
        secure: environment.NODE_ENV === 'production',
      },
      gcLottery: {
        hits: Number(environment.SESSION_GC_LOTTERY_HITS),
        total: Number(environment.SESSION_GC_LOTTERY_TOTAL),
      },
    }),
  });
  return config;
}

function createProviderApplication(
  config: AppConfig,
  container: ServiceContainer,
): AppPluginApplication {
  return {
    appName: 'test',
    publicBasePath: '',
    config,
    paths: createConfigPaths({ rootDir: process.cwd() }),
    router: new Hono(),
    container,
  };
}

function createRuntimeConfig(
  overrides: Partial<AppSessionConfigInput>,
): AppSessionConfigInput {
  return {
    enabled: true,
    default: 'memory',
    cookie: { name: 'session' },
    lifetime: { absolute: '2h' },
    previousSecrets: [],
    gcLottery: { hits: 2, total: 100 },
    stores: { memory: { driver: 'memory' } },
    ...overrides,
  };
}
