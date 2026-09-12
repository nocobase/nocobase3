import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Application,
  type ApplicationOptions,
} from '../src/application/index.js';
import {
  appConfig as appIdentityConfig,
  AppConfig,
  createConfigPaths,
} from '../src/config/index.js';
import { i18nConfig, i18nToken, I18nProvider } from '../src/i18n/index.js';
import { defineServerPlugin } from '../src/plugins/index.js';
import { spaConfig, spaRootRoutes } from '../src/spa/index.js';

const applicationLocales = {
  'en-US': () => Promise.resolve({ default: { greeting: 'Hello' } }),
  'zh-CN': () => Promise.resolve({ default: { greeting: '你好' } }),
};

/** A plugin translating a language the application itself does not offer. */
const pluginLocales = {
  'en-US': () => Promise.resolve({ default: { plugin: 'Plugin' } }),
  'ja-JP': () => Promise.resolve({ default: { plugin: 'プラグイン' } }),
};

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('i18n config', () => {
  it('defaults to en-US and declares no locale list', async () => {
    const config = await createAppConfig();

    expect(config.get(i18nConfig)).toEqual({ defaultLocale: 'en-US' });
  });

  it('reads the default locale from APP_DEFAULT_LOCALE', async () => {
    const config = await createAppConfig({ APP_DEFAULT_LOCALE: 'zh-CN' });

    expect(config.get(i18nConfig).defaultLocale).toBe('zh-CN');
  });

  it('rejects a locale list in configuration', async () => {
    const config = new AppConfig([i18nConfig]);
    config.load({
      name: 'test',
      read: () =>
        Promise.resolve({
          kind: 'map' as const,
          value: { i18n: { locales: ['en-US', 'zh-CN'] } },
        }),
    });

    await expect(config.loadAll()).rejects.toThrow(/i18n/);
  });
});

describe('application locales', () => {
  it('offers the languages the application declares, not the ones a plugin adds', async () => {
    const app = await startApplication();

    const runtime = app.container.resolve(i18nToken);
    expect(runtime.getLocales()).toEqual(['en-US', 'zh-CN']);
    // The plugin's translations still reach the languages the application does offer.
    expect(runtime.getFixedT('@nocobase/app-plugin-test')('plugin')).toBe(
      'Plugin',
    );

    await app.shutdown();
  });

  it('keeps the configured default on offer when the application does not declare it', async () => {
    const app = await startApplication({ APP_DEFAULT_LOCALE: 'fr-FR' });

    const runtime = app.container.resolve(i18nToken);
    expect(runtime.getDefaultLocale()).toBe('fr-FR');
    expect(runtime.getLocales()).toContain('fr-FR');

    await app.shutdown();
  });

  it('resolves a requested locale against the application list alone', async () => {
    const app = await startApplication();

    const runtime = app.container.resolve(i18nToken);
    expect(runtime.resolveLocale('zh-CN')).toBe('zh-CN');
    expect(runtime.resolveLocale('ja-JP')).toBe('en-US');

    await app.shutdown();
  });

  it('offers only the default when the application declares no locales', async () => {
    const app = await startApplication({}, { withApplicationLocales: false });

    expect(app.container.resolve(i18nToken).getLocales()).toEqual(['en-US']);

    await app.shutdown();
  });
});

describe('the default locale published to the browser', () => {
  it('reaches the client config, so both sides read one value', async () => {
    const config = await createSpaAppConfig({ APP_DEFAULT_LOCALE: 'zh-CN' });

    const html = await fetchSpaIndex(config);

    expect(html).toContain('"i18n":{"defaultLocale":"zh-CN"}');
  });

  it('is omitted when the application registers no i18n config', async () => {
    const config = await createSpaAppConfig({}, { withI18nConfig: false });

    const html = await fetchSpaIndex(config);

    expect(html).not.toContain('"i18n"');
  });
});

async function fetchSpaIndex(config: AppConfig): Promise<string> {
  const root = mkdtempSync(path.join(tmpdir(), 'nocobase-spa-'));
  temporaryDirectories.push(root);
  writeFileSync(path.join(root, 'index.html'), '<main></main>', 'utf8');

  const router = new Hono();
  router.route(
    '/',
    spaRootRoutes.createRouter({
      config,
      mode: 'standalone',
      publicBasePath: '/main',
    }),
  );

  const response = await router.request('http://localhost/main');
  return response.text();
}

async function createSpaAppConfig(
  environment: Readonly<Record<string, string>> = {},
  options: { readonly withI18nConfig?: boolean } = {},
): Promise<AppConfig> {
  const root = mkdtempSync(path.join(tmpdir(), 'nocobase-spa-index-'));
  temporaryDirectories.push(root);
  writeFileSync(path.join(root, 'index.html'), '<main></main>', 'utf8');

  const config = new AppConfig(
    [
      {
        ...appIdentityConfig,
        defaults: {
          name: 'main',
          publicBasePath: '/main',
          internalBasePath: '',
          publicApiUrl: '/main/api',
        },
      },
      ...(options.withI18nConfig === false ? [] : [i18nConfig]),
      {
        ...spaConfig,
        defaults: {
          indexPath: path.join(root, 'index.html'),
          runtime: {
            storagePrefix: 'NOCOBASE_',
            storageType: 'localStorage',
            shareToken: false,
          },
        },
      },
    ],
    { environment },
  );
  await config.loadAll();
  return config;
}

async function startApplication(
  environment: Readonly<Record<string, string>> = {},
  options: { readonly withApplicationLocales?: boolean } = {},
): Promise<Application> {
  const app = new Application(await createTestApplicationOptions(environment));
  app.addServiceProvider(I18nProvider);
  app.addRuntimeContributions({
    plugins: {
      appPackageName: '@nocobase/app-test',
      plugins: [
        {
          definition: defineServerPlugin({
            packageName: '@nocobase/app-plugin-test',
            locales: () => Promise.resolve(pluginLocales),
          }),
          metadata: {
            packageName: '@nocobase/app-plugin-test',
            version: 'test',
            rootDir: '/test/plugins/test',
            jobLocations: [],
          },
        },
      ],
    },
    serviceProviders: [],
    routes: [],
    locales:
      options.withApplicationLocales === false
        ? undefined
        : () => Promise.resolve(applicationLocales),
  });
  await app.start();
  return app;
}

async function createAppConfig(
  environment: Readonly<Record<string, string>> = {},
): Promise<AppConfig> {
  const config = new AppConfig([i18nConfig], { environment });
  await config.loadAll();
  return config;
}

async function createTestApplicationOptions(
  environment: Readonly<Record<string, string>>,
): Promise<ApplicationOptions> {
  const config = new AppConfig(
    [
      {
        ...appIdentityConfig,
        defaults: {
          name: 'main',
          publicBasePath: '/main',
          internalBasePath: '',
          publicApiUrl: '/main/api',
        },
      },
      i18nConfig,
    ],
    { environment },
  );
  await config.loadAll();

  return { config, paths: createConfigPaths({ rootDir: '/test/app' }) };
}
