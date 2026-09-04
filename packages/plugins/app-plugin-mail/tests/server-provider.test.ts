import { ServiceContainer } from '@nocobase/service-provider';
import { createConfigPaths } from '@nocobase/app-server/config';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { MailCoreProvider } from '../server/providers/mail-core.js';
import {
  mailProviderRegistryToken,
  mailProviderAdapterResolverToken,
  mailRuntimeToken,
  mailServiceToken,
  mailStoreToken,
} from '../server/tokens.js';

describe('@nocobase/app-plugin-mail', () => {
  it('registers the Provider Registry and lazy Mail runtime services', () => {
    const container = new ServiceContainer();
    const provider = new MailCoreProvider({
      appName: 'test',
      publicBasePath: '/test',
      config: { app: { name: 'test', publicBasePath: '/test' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router: new Hono(),
      container,
    });

    expect(provider.name).toBe('@nocobase/app-plugin-mail');
    provider.register();

    expect(container.has(mailProviderRegistryToken)).toBe(true);
    expect(container.has(mailProviderAdapterResolverToken)).toBe(true);
    expect(container.has(mailRuntimeToken)).toBe(true);
    expect(container.has(mailServiceToken)).toBe(true);
    expect(container.has(mailStoreToken)).toBe(true);
  });
});
