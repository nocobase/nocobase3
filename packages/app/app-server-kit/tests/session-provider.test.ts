import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { ServiceContainer } from '@nocobase/service-provider';

import { AppConfig, createConfigPaths } from '../src/config/index.js';
import { nodeServerConfig } from '../src/node/index.js';
import type { AppPluginApplication } from '../src/plugins/index.js';
import type { ResolvedAppRuntimeConfigContext } from '../src/runtime/index.js';
import {
  SessionProvider,
  resolveAppSessionConfig,
  sessionConfig,
  sessionManagerToken,
  type AppSessionConfigInput,
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

    const resolved = resolveAppSessionConfig(
      configured,
      'ephemeral-secret',
      true,
    );

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
      resolveAppSessionConfig(configured, 'ephemeral-secret', false),
    ).toThrow('session.gcLottery.hits must not exceed');
  });
});

async function createSessionAppConfig(
  environment: Readonly<Record<string, string>>,
): Promise<AppConfig<ResolvedAppRuntimeConfigContext>> {
  const paths = createConfigPaths({ rootDir: process.cwd() });
  const context = { paths } as ResolvedAppRuntimeConfigContext;
  const config = new AppConfig([sessionConfig, nodeServerConfig], {
    context,
    environment,
  });
  await config.loadAll();
  return config;
}

function createProviderApplication(
  config: AppConfig<ResolvedAppRuntimeConfigContext>,
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
