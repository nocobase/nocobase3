import type { ConfigEnv, UserConfig, UserConfigFn } from 'vite';
import { describe, expect, it } from 'vitest';

import { createPortalViteConfig } from '../vite/portal.ts';

const buildEnvironment: ConfigEnv = { command: 'build', mode: 'production' };

const resolvePortalConfig = async (
  localConfig: UserConfig = {},
): Promise<UserConfig> => {
  const config = createPortalViteConfig(localConfig) as UserConfigFn;
  return (await config(buildEnvironment)) as UserConfig;
};

// Evaluates the expression Vite inlines into the bundle, with the runtime global the server injects.
const evaluateAssetUrl = (
  expression: string,
  appBasePath?: string,
): unknown => {
  const globals =
    appBasePath === undefined ? {} : { APP_BASE_PATH: appBasePath };
  return new Function('globalThis', `return ${expression};`)(globals);
};

const renderJsAssetUrl = async (
  filename: string,
  localConfig: UserConfig = {},
): Promise<string> => {
  const { experimental } = await resolvePortalConfig(localConfig);
  const rendered = experimental?.renderBuiltUrl?.(filename, {
    hostId: 'assets/index-hash.js',
    hostType: 'js',
    ssr: false,
    type: 'asset',
  });

  if (typeof rendered !== 'object' || typeof rendered?.runtime !== 'string') {
    throw new Error(
      `Expected a runtime expression, received ${String(rendered)}.`,
    );
  }

  return rendered.runtime;
};

describe('createPortalViteConfig asset URLs', () => {
  // Vite otherwise inlines the build-time base into `__vitePreload`, which 404s every preloaded
  // stylesheet once a host mounts the build under a different prefix. See the comment in vite/portal.ts.
  it('resolves a JavaScript asset reference from the runtime base path', async () => {
    const expression = await renderJsAssetUrl('assets/page-hash.css', {
      base: '/main/',
    });

    expect(evaluateAssetUrl(expression, '/hdsp/')).toBe(
      '/hdsp/assets/page-hash.css',
    );
    expect(evaluateAssetUrl(expression, '/')).toBe('/assets/page-hash.css');
  });

  it('falls back to the build-time base when no runtime base path is injected', async () => {
    const expression = await renderJsAssetUrl('assets/page-hash.css', {
      base: '/main/',
    });

    expect(evaluateAssetUrl(expression)).toBe('/main/assets/page-hash.css');
  });

  it('defaults to the root base when the consumer configures none', async () => {
    const expression = await renderJsAssetUrl('assets/page-hash.css');

    expect(evaluateAssetUrl(expression)).toBe('/assets/page-hash.css');
  });

  // Vite rejects a runtime expression outside a JavaScript host, and a host that rewrites the asset
  // URLs in `index.html` needs to find the build-time base there.
  it.each(['css', 'html'] as const)(
    'leaves a %s asset reference to the build-time base',
    async (hostType) => {
      const { experimental } = await resolvePortalConfig({ base: '/main/' });

      expect(
        experimental?.renderBuiltUrl?.('assets/page-hash.css', {
          hostId: 'index.html',
          hostType,
          ssr: false,
          type: 'asset',
        }),
      ).toBeUndefined();
    },
  );

  it('leaves a server-rendered asset reference to the build-time base', async () => {
    const { experimental } = await resolvePortalConfig({ base: '/main/' });

    expect(
      experimental?.renderBuiltUrl?.('assets/page-hash.css', {
        hostId: 'assets/index-hash.js',
        hostType: 'js',
        ssr: true,
        type: 'asset',
      }),
    ).toBeUndefined();
  });

  it('keeps a renderBuiltUrl the consumer configured', async () => {
    const { experimental } = await resolvePortalConfig({
      base: '/main/',
      experimental: { renderBuiltUrl: (filename) => `/cdn/${filename}` },
    });

    expect(
      experimental?.renderBuiltUrl?.('assets/page-hash.css', {
        hostId: 'assets/index-hash.js',
        hostType: 'js',
        ssr: false,
        type: 'asset',
      }),
    ).toBe('/cdn/assets/page-hash.css');
  });
});
