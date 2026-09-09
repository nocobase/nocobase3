import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppClientConfig } from '../src/config.js';
import { createAppI18nRuntime } from '../src/i18n.js';
import { defineClientPlugins } from '../src/plugins.js';
import { defineAppRuntime, resolveAppRuntime } from '../src/runtime/index.js';

const definition = defineAppRuntime({
  packageName: '@example/app',
  config: createAppClientConfig,
  plugins: defineClientPlugins([]),
  locales: {
    'en-US': async () => ({ greeting: 'Hello' }),
    'zh-CN': async () => ({ greeting: '你好' }),
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runtime default locale', () => {
  it.each([
    [undefined, undefined, 'zh-CN', 'zh-CN'],
    [undefined, undefined, 'fr-FR', 'en-US'],
    [undefined, 'zh-CN', 'en-US', 'zh-CN'],
    ['en-US', 'zh-CN', 'zh-CN', 'en-US'],
    ['invalid', 'zh-CN', 'en-US', 'zh-CN'],
    ['invalid', 'invalid', 'zh-CN', 'zh-CN'],
    [undefined, 12, 'zh-CN', 'zh-CN'],
    [undefined, 'fr-FR', 'en-US', 'en-US'],
    [undefined, 'zh', 'en-US', 'zh-CN'],
    ['zh-Hans-CN', 'en-US', 'en-US', 'zh-CN'],
  ])(
    'resolves stored %s, configured %s, browser %s to %s',
    async (stored, configured, browser, expected) => {
      const setItem = vi.fn();
      vi.stubGlobal('localStorage', { getItem: () => stored ?? null, setItem });
      vi.stubGlobal('navigator', { language: browser });

      const runtime = await resolveAppRuntime(definition, {
        rawConfig:
          configured === undefined
            ? {}
            : { app: { defaultLocale: configured } },
      });

      expect(runtime.i18n.getLocale()).toBe(expected);
      expect(runtime.i18n.getLocales()).toEqual(['en-US', 'zh-CN']);
      expect(runtime.i18n.getFixedT('@example/app')('greeting')).toBe(
        expected === 'zh-CN' ? '你好' : 'Hello',
      );
      expect(setItem).not.toHaveBeenCalled();
    },
  );

  it('uses the configured default when storage is unavailable and still switches languages', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    vi.stubGlobal('navigator', { language: 'en-US' });
    const runtime = await resolveAppRuntime(definition, {
      rawConfig: { app: { defaultLocale: 'zh-CN' } },
    });
    expect(runtime.i18n.getLocale()).toBe('zh-CN');
    await runtime.i18n.changeLanguage('en-US');
    expect(runtime.i18n.getLocale()).toBe('en-US');
  });

  it('preserves explicit initial and fallback locale options on the i18n factory', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'en-US' });
    const runtime = await createAppI18nRuntime({
      contributions: [],
      defaultLocale: 'fr-FR',
      locales: ['en-US', 'zh-CN'],
      initialLocale: 'zh-CN',
    });
    expect(runtime.getLocale()).toBe('zh-CN');
    expect(runtime.getDefaultLocale()).toBe('fr-FR');
  });
});
