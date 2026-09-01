import { describe, expect, it, vi } from 'vitest';

import { I18nRegistry } from '../src/core/registry.js';
import type { LocaleLoaders } from '../src/core/types.js';

const workflowLocales: LocaleLoaders = {
  'en-US': () =>
    Promise.resolve({ default: { trigger: { title: 'Trigger' } } }),
  'zh-CN': () => Promise.resolve({ default: { trigger: { title: '触发' } } }),
};

describe('I18nRegistry', () => {
  it('loads a namespace resource for a locale', async () => {
    const registry = new I18nRegistry();
    registry.register('@acme/plugin', workflowLocales);

    await expect(
      registry.loadNamespace('@acme/plugin', 'en-US'),
    ).resolves.toEqual({
      trigger: { title: 'Trigger' },
    });
  });

  it('accepts a module that exports the resource without a default', async () => {
    const registry = new I18nRegistry();
    registry.register('@acme/plugin', {
      'en-US': () => Promise.resolve({ save: 'Save' }),
    });

    await expect(
      registry.loadNamespace('@acme/plugin', 'en-US'),
    ).resolves.toEqual({ save: 'Save' });
  });

  it('imports a locale once however many times it is requested', async () => {
    const loader = vi.fn(() => Promise.resolve({ default: { save: 'Save' } }));
    const registry = new I18nRegistry();
    registry.register('@acme/plugin', { 'en-US': loader });

    await registry.loadNamespace('@acme/plugin', 'en-US');
    await registry.loadNamespace('@acme/plugin', 'en-US');

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('shares one import between concurrent requests for the same locale', async () => {
    const loader = vi.fn(() => Promise.resolve({ default: { save: 'Save' } }));
    const registry = new I18nRegistry();
    registry.register('@acme/plugin', { 'en-US': loader });

    await Promise.all([
      registry.loadNamespace('@acme/plugin', 'en-US'),
      registry.loadNamespace('@acme/plugin', 'en-US'),
      registry.loadNamespace('@acme/plugin', 'en-US'),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not load a locale the namespace does not translate', async () => {
    const registry = new I18nRegistry();
    registry.register('@acme/plugin', workflowLocales);

    await expect(
      registry.loadNamespace('@acme/plugin', 'fr-FR'),
    ).resolves.toBeUndefined();
    expect(registry.isLoaded('@acme/plugin', 'fr-FR')).toBe(false);
  });

  it('loads every registered namespace for a locale in one pass', async () => {
    const registry = new I18nRegistry();
    registry.register('@acme/plugin-a', {
      'en-US': () => Promise.resolve({ default: { a: 'A' } }),
    });
    registry.register('@acme/plugin-b', {
      'en-US': () => Promise.resolve({ default: { b: 'B' } }),
    });

    const result = await registry.loadLocale('en-US');

    expect(result.resources).toEqual([
      { namespace: '@acme/plugin-a', locale: 'en-US', resource: { a: 'A' } },
      { namespace: '@acme/plugin-b', locale: 'en-US', resource: { b: 'B' } },
    ]);
  });

  it('skips namespaces that do not translate the requested locale', async () => {
    const registry = new I18nRegistry();
    registry.register('@acme/translated', {
      'zh-CN': () => Promise.resolve({ default: { a: '甲' } }),
    });
    registry.register('@acme/untranslated', {
      'en-US': () => Promise.resolve({ default: { b: 'B' } }),
    });

    const result = await registry.loadLocale('zh-CN');

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]?.namespace).toBe('@acme/translated');
  });

  it('separates an application override block from its own translations', async () => {
    const registry = new I18nRegistry();
    registry.register('@acme/app', {
      'zh-CN': () =>
        Promise.resolve({
          default: {
            welcome: '欢迎',
            overrides: { '@acme/plugin': { trigger: { title: '触发条件' } } },
          },
        }),
    });

    const result = await registry.loadLocale('zh-CN');

    expect(result.resources[0]?.resource).toEqual({ welcome: '欢迎' });
    expect(result.overrides).toEqual({
      '@acme/plugin': { trigger: { title: '触发条件' } },
    });
  });

  it('merges loaders when a namespace registers twice', async () => {
    const registry = new I18nRegistry();
    registry.register('@acme/plugin', {
      'en-US': () => Promise.resolve({ default: { a: 'A' } }),
    });
    registry.register('@acme/plugin', {
      'zh-CN': () => Promise.resolve({ default: { a: '甲' } }),
    });

    expect(registry.getAvailableLocales()).toEqual(['en-US', 'zh-CN']);
  });

  describe('fallback chain', () => {
    it('goes through the application namespace to the base package', () => {
      const registry = new I18nRegistry();
      registry.setApplicationNamespace('@acme/app');

      expect(registry.getFallbackNamespaces('@acme/plugin')).toEqual([
        '@acme/app',
        '@nocobase/i18n',
      ]);
    });

    it('does not list the application namespace as its own fallback', () => {
      const registry = new I18nRegistry();
      registry.setApplicationNamespace('@acme/app');

      expect(registry.getFallbackNamespaces('@acme/app')).toEqual([
        '@nocobase/i18n',
      ]);
    });

    it('falls back to the base package when no application is registered', () => {
      const registry = new I18nRegistry();

      expect(registry.getFallbackNamespaces('@acme/plugin')).toEqual([
        '@nocobase/i18n',
      ]);
    });
  });
});
