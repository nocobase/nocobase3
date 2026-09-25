import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppClientConfig } from '../src/config.js';
import { defineClientPlugins } from '../src/plugins.js';
import { readAppClientPublicConfig } from '../src/runtime/browser-config.js';
import { defineAppRuntime, resolveAppRuntime } from '../src/runtime/index.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('public client config', () => {
  it('keeps published values apart from the client configuration', () => {
    const config = createAppClientConfig({
      rawConfig: { app: { title: 'NocoBase' } },
      rawPublicConfig: { auth: { emailAndPassword: { disableSignUp: true } } },
    });
    config.mergeDefaults({ auth: { plugins: ['username'] } });

    expect(config.get('auth')).toEqual({ plugins: ['username'] });
    expect(config.public.get('auth.emailAndPassword.disableSignUp')).toBe(true);
    expect(config.public.has('auth.emailAndPassword.disableSignUp')).toBe(true);
    expect(config.public.raw()).toEqual({
      auth: { emailAndPassword: { disableSignUp: true } },
    });
  });

  it('points to config.public when a published value is read through config.get', () => {
    const config = createAppClientConfig({
      rawConfig: {},
      rawPublicConfig: { auth: { emailAndPassword: { disableSignUp: true } } },
    });

    expect(() => config.get('auth.emailAndPassword.disableSignUp')).toThrow(
      "auth.emailAndPassword.disableSignUp is published by the server; read it with config.public.get('auth.emailAndPassword.disableSignUp').",
    );
  });

  it('warns with the published paths when an unpublished path is read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = createAppClientConfig({
      rawConfig: {},
      rawPublicConfig: { billing: { currency: 'USD', trialDays: 14 } },
    });

    expect(config.public.get('billing.stripeSecret', 'none')).toBe('none');
    expect(warn).toHaveBeenCalledWith(
      "billing.stripeSecret is not published by the server. Published paths: billing.currency, billing.trialDays. Add it to public in the section's defineAppConfig on the server if the browser needs it.",
    );
  });

  it('reads the published block from the page', () => {
    document.body.innerHTML = `
      <script id="nocobase-runtime-config" type="application/json">
        {"version":1,"config":{},"public":{"auth":{"emailAndPassword":{"disableSignUp":true}}}}
      </script>
    `;

    expect(readAppClientPublicConfig()).toEqual({
      auth: { emailAndPassword: { disableSignUp: true } },
    });
  });

  it('starts in the locale the server publishes', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const runtime = await resolveAppRuntime(
      defineAppRuntime({
        packageName: '@example/app',
        createAppConfig: createAppClientConfig,
        plugins: defineClientPlugins([]),
        locales: {
          'en-US': async () => ({}),
          'zh-CN': async () => ({}),
        },
      }),
      {
        rawConfig: {},
        rawPublicConfig: { i18n: { defaultLocale: 'zh-CN' } },
      },
    );

    expect(runtime.i18n.getLocale()).toBe('zh-CN');
  });
});
