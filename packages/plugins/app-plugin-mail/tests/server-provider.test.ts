import { ServiceContainer } from '@nocobase/service-provider';
import { createConfigPaths } from '@nocobase/app-server/config';
import {
  realtimeServiceToken,
  type RealtimeService,
} from '@nocobase/app-server/realtime';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { MailCoreProvider } from '../server/providers/mail-core.js';
import {
  mailCredentialVaultToken,
  mailProviderRegistryToken,
  mailProviderAdapterResolverToken,
  mailRuntimeToken,
  mailServiceToken,
  mailStoreToken,
} from '../server/tokens.js';
import type { MailCredentialVault } from '../server/types.js';

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
    expect(container.has(mailCredentialVaultToken)).toBe(true);
  });

  it('keeps a credential vault registered by another plugin', () => {
    const container = new ServiceContainer();
    const credentialVault = {} as MailCredentialVault;
    container.instance(mailCredentialVaultToken, credentialVault);
    const provider = new MailCoreProvider({
      appName: 'test',
      publicBasePath: '/test',
      config: { app: { name: 'test', publicBasePath: '/test' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router: new Hono(),
      container,
    });

    provider.register();

    expect(container.resolve(mailCredentialVaultToken)).toBe(credentialVault);
  });

  it('registers a user-scoped realtime topic for message changes', async () => {
    const close = vi.fn();
    const defineTopic = vi.fn(() => ({ publishFor: vi.fn(), close }));
    const container = new ServiceContainer();
    container.instance(realtimeServiceToken, {
      defineTopic,
    } as unknown as RealtimeService);
    const provider = new MailCoreProvider({
      appName: 'test',
      publicBasePath: '/test',
      config: { app: { name: 'test', publicBasePath: '/test' } },
      paths: createConfigPaths({ rootDir: '/missing' }),
      router: new Hono(),
      container,
    });

    provider.register();
    await provider.boot();

    expect(defineTopic).toHaveBeenCalledWith('mail:messages', {
      audience: 'user',
    });

    await provider.shutdown();
    expect(close).toHaveBeenCalledOnce();
  });
});
