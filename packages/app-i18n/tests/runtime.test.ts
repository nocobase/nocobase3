import { describe, expect, it, vi } from 'vitest';

import { I18nRuntime } from '../src/core/runtime.js';

const APP_NS = '@acme/app';
const PLUGIN_NS = '@acme/plugin';

function createRuntime() {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: APP_NS,
  });

  runtime.registerApplicationNamespace(APP_NS, {
    'en-US': () =>
      Promise.resolve({ default: { save: 'Save', welcome: 'Welcome' } }),
    'zh-CN': () =>
      Promise.resolve({ default: { save: '保存', welcome: '欢迎' } }),
  });

  runtime.registerNamespace(PLUGIN_NS, {
    'en-US': () =>
      Promise.resolve({
        default: { trigger: { title: 'Trigger', hint: 'Pick one' } },
      }),
    'zh-CN': () => Promise.resolve({ default: { trigger: { title: '触发' } } }),
  });

  return runtime;
}

describe('I18nRuntime', () => {
  it('translates a namespace key', async () => {
    const runtime = createRuntime();
    await runtime.init('en-US');

    expect(runtime.getFixedT(PLUGIN_NS)('trigger.title')).toBe('Trigger');
  });

  it('resolves nested keys through the dot separator', async () => {
    const runtime = createRuntime();
    await runtime.init('en-US');

    expect(runtime.getFixedT(PLUGIN_NS)('trigger.hint')).toBe('Pick one');
  });

  it('falls back from a plugin namespace to the application', async () => {
    const runtime = createRuntime();
    await runtime.init('en-US');

    // 'save' exists only in the application namespace.
    expect(runtime.getFixedT(PLUGIN_NS)('save')).toBe('Save');
  });

  it('prefers a plugin key over the application key of the same name', async () => {
    const runtime = new I18nRuntime({
      defaultLocale: 'en-US',
      applicationNamespace: APP_NS,
    });
    runtime.registerApplicationNamespace(APP_NS, {
      'en-US': () => Promise.resolve({ default: { save: 'App save' } }),
    });
    runtime.registerNamespace(PLUGIN_NS, {
      'en-US': () => Promise.resolve({ default: { save: 'Plugin save' } }),
    });
    await runtime.init('en-US');

    expect(runtime.getFixedT(PLUGIN_NS)('save')).toBe('Plugin save');
  });

  it('translates an explicitly named namespace', async () => {
    const runtime = createRuntime();
    await runtime.init('en-US');

    expect(runtime.getFixedT(PLUGIN_NS)('welcome', { ns: APP_NS })).toBe(
      'Welcome',
    );
  });

  it('lets the application override a plugin string', async () => {
    const runtime = new I18nRuntime({
      defaultLocale: 'zh-CN',
      applicationNamespace: APP_NS,
    });
    runtime.registerApplicationNamespace(APP_NS, {
      'zh-CN': () =>
        Promise.resolve({
          default: {
            overrides: { [PLUGIN_NS]: { trigger: { title: '触发条件' } } },
          },
        }),
    });
    runtime.registerNamespace(PLUGIN_NS, {
      'zh-CN': () =>
        Promise.resolve({
          default: { trigger: { title: '触发', hint: '提示' } },
        }),
    });
    await runtime.init('zh-CN');

    const t = runtime.getFixedT(PLUGIN_NS);
    expect(t('trigger.title')).toBe('触发条件');
    // Overriding one key must not drop the rest of the namespace.
    expect(t('trigger.hint')).toBe('提示');
  });

  describe('locale resolution', () => {
    it('matches a language subtag against a configured regional locale', () => {
      const runtime = createRuntime();

      expect(runtime.resolveLocale('zh')).toBe('zh-CN');
      expect(runtime.resolveLocale('zh-Hans-CN')).toBe('zh-CN');
    });

    it('falls back to the default for an unsupported locale', () => {
      const runtime = createRuntime();

      expect(runtime.resolveLocale('fr-FR')).toBe('en-US');
      expect(runtime.resolveLocale(undefined)).toBe('en-US');
    });

    it('takes the first supported entry out of an ordered preference list', () => {
      const runtime = createRuntime();

      expect(runtime.resolvePreferredLocale(['fr-FR', 'zh-CN'])).toBe('zh-CN');
      expect(runtime.resolvePreferredLocale(['fr-FR', 'de-DE'])).toBe('en-US');
    });
  });

  describe('lazy loading', () => {
    it('loads only the initial locale at startup', async () => {
      const chinese = vi.fn(() =>
        Promise.resolve({ default: { save: '保存' } }),
      );
      const runtime = new I18nRuntime({
        defaultLocale: 'en-US',
        locales: ['en-US', 'zh-CN'],
        applicationNamespace: APP_NS,
      });
      runtime.registerApplicationNamespace(APP_NS, {
        'en-US': () => Promise.resolve({ default: { save: 'Save' } }),
        'zh-CN': chinese,
      });

      await runtime.init('en-US');

      expect(chinese).not.toHaveBeenCalled();
    });

    it('loads a locale when the language changes to it', async () => {
      const runtime = createRuntime();
      await runtime.init('en-US');

      await runtime.changeLanguage('zh-CN');

      expect(runtime.getLocale()).toBe('zh-CN');
      expect(runtime.getFixedT(PLUGIN_NS)('trigger.title')).toBe('触发');
    });

    it('switches every namespace together', async () => {
      const runtime = createRuntime();
      await runtime.init('en-US');
      await runtime.changeLanguage('zh-CN');

      // Both namespaces have to be in the new language; a half-translated frame is the failure this guards.
      expect(runtime.getFixedT(APP_NS)('welcome')).toBe('欢迎');
      expect(runtime.getFixedT(PLUGIN_NS)('trigger.title')).toBe('触发');
    });

    it('loads a locale once across repeated requests', async () => {
      const loader = vi.fn(() =>
        Promise.resolve({ default: { save: 'Save' } }),
      );
      const runtime = new I18nRuntime({
        defaultLocale: 'en-US',
        applicationNamespace: APP_NS,
      });
      runtime.registerApplicationNamespace(APP_NS, { 'en-US': loader });

      await runtime.init('en-US');
      await runtime.ensureLocaleLoaded('en-US');
      await runtime.ensureLocaleLoaded('en-US');

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('retries a locale whose load failed', async () => {
      const loader = vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ default: { save: 'Save' } });
      const runtime = new I18nRuntime({
        defaultLocale: 'en-US',
        locales: ['en-US', 'zh-CN'],
        applicationNamespace: APP_NS,
      });
      runtime.registerApplicationNamespace(APP_NS, {
        'en-US': () => Promise.resolve({ default: {} }),
        'zh-CN': loader,
      });
      await runtime.init('en-US');

      await expect(runtime.ensureLocaleLoaded('zh-CN')).rejects.toThrow(
        'network',
      );
      // A cached rejection would make the locale unreachable for the rest of the process.
      await expect(
        runtime.ensureLocaleLoaded('zh-CN'),
      ).resolves.toBeUndefined();
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  describe('explicit locale', () => {
    it('translates into a locale other than the current one', async () => {
      const runtime = createRuntime();
      await runtime.init('en-US');
      await runtime.ensureLocaleLoaded('zh-CN');

      // Outbound content follows its recipient, not the interface language.
      expect(runtime.getFixedT(PLUGIN_NS, 'zh-CN')('trigger.title')).toBe(
        '触发',
      );
      expect(runtime.getLocale()).toBe('en-US');
    });
  });
});
