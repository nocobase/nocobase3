import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { I18nRuntime } from '../../src/core/index.js';
import {
  AppI18nError,
  createI18nMiddleware,
  getRequestLocale,
  serializeI18nError,
  type Translator,
} from '../../src/server/index.js';

const APP = '@acme/app';
const PLUGIN = '@acme/plugin';

async function createRuntime(): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: APP,
  });
  runtime.registerApplicationNamespace(APP, {
    'en-US': () => Promise.resolve({ default: { greeting: 'Hello' } }),
    'zh-CN': () => Promise.resolve({ default: { greeting: '你好' } }),
  });
  runtime.registerNamespace(PLUGIN, {
    'en-US': () =>
      Promise.resolve({
        default: { errors: { invalid: 'Invalid {{field}}' } },
      }),
    'zh-CN': () =>
      Promise.resolve({ default: { errors: { invalid: '{{field}} 无效' } } }),
  });
  await runtime.init('en-US');
  return runtime;
}

/** A Hono app that reports the locale and translator the middleware installed. */
function createApp(runtime: I18nRuntime, session?: Record<string, unknown>) {
  const app = new Hono();
  if (session) {
    app.use('*', async (context, next) => {
      context.set('session', { data: session });
      await next();
    });
  }
  app.use('*', createI18nMiddleware(runtime));
  app.get('/', (context) => {
    const translate = context.get('t') as Translator;
    return context.json({
      locale: getRequestLocale(context),
      greeting: translate('greeting'),
    });
  });
  return app;
}

describe('createI18nMiddleware', () => {
  it('falls back to the default locale with nothing to go on', async () => {
    const app = createApp(await createRuntime());

    const response = await app.request('/');

    await expect(response.json()).resolves.toEqual({
      locale: 'en-US',
      greeting: 'Hello',
    });
  });

  it('takes the locale from Accept-Language', async () => {
    const app = createApp(await createRuntime());

    const response = await app.request('/', {
      headers: { 'accept-language': 'zh-CN,en;q=0.8' },
    });

    await expect(response.json()).resolves.toEqual({
      locale: 'zh-CN',
      greeting: '你好',
    });
  });

  it('prefers the session over Accept-Language', async () => {
    const app = createApp(await createRuntime(), { locale: 'zh-CN' });

    const response = await app.request('/', {
      headers: { 'accept-language': 'en-US' },
    });

    await expect(response.json()).resolves.toEqual({
      locale: 'zh-CN',
      greeting: '你好',
    });
  });

  it('ignores an unsupported session locale', async () => {
    const app = createApp(await createRuntime(), { locale: 'fr-FR' });

    const response = await app.request('/');

    await expect(response.json()).resolves.toMatchObject({ locale: 'en-US' });
  });

  it('works with no session middleware mounted', async () => {
    const app = createApp(await createRuntime());

    const response = await app.request('/');

    expect(response.status).toBe(200);
  });

  it('loads a locale before the handler runs, so translation is synchronous', async () => {
    const runtime = await createRuntime();
    const app = createApp(runtime);

    // zh-CN was never loaded during init; the middleware has to await it.
    const response = await app.request('/', {
      headers: { 'accept-language': 'zh-CN' },
    });

    await expect(response.json()).resolves.toMatchObject({ greeting: '你好' });
  });
});

describe('AppI18nError', () => {
  it('translates the message into the request locale and keeps the key', async () => {
    const runtime = await createRuntime();
    await runtime.ensureLocaleLoaded('zh-CN');
    const error = new AppI18nError('PLUGIN_INVALID', {
      ns: PLUGIN,
      key: 'errors.invalid',
      params: { field: 'name' },
    });

    expect(serializeI18nError(runtime, error, 'zh-CN')).toEqual({
      code: 'PLUGIN_INVALID',
      message: 'name 无效',
      ns: PLUGIN,
      key: 'errors.invalid',
      params: { field: 'name' },
    });
  });

  it('renders the same error differently per locale', async () => {
    const runtime = await createRuntime();
    await runtime.ensureLocaleLoaded('zh-CN');
    const error = new AppI18nError('PLUGIN_INVALID', {
      ns: PLUGIN,
      key: 'errors.invalid',
      params: { field: 'name' },
    });

    // Translating at serialization is what makes one thrown error serve callers in different languages.
    expect(serializeI18nError(runtime, error, 'en-US').message).toBe(
      'Invalid name',
    );
    expect(serializeI18nError(runtime, error, 'zh-CN').message).toBe(
      'name 无效',
    );
  });

  it('keeps an untranslated message on the error itself for logs', () => {
    const error = new AppI18nError('PLUGIN_INVALID', {
      ns: PLUGIN,
      key: 'errors.invalid',
    });

    expect(error.message).toContain('PLUGIN_INVALID');
    expect(error.stack).toBeDefined();
  });
});
