import {
  ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';
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
import { loggingToken } from '@nocobase/app-server/logging';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { mailOutboundAttachmentStorageToken } from '../server/tokens.js';
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

  it.each([true, false])(
    'publishes from a service resolved before boot: %s',
    async (early) => {
      const publishFor = vi.fn();
      const close = vi.fn();
      const container = new ServiceContainer();
      const provider = new MailCoreProvider({
        appName: 'test',
        publicBasePath: '/test',
        config: {
          get: () => ({ automaticSyncIntervalMs: 300000, syncBatchSize: 100 }),
        } as never,
        paths: createConfigPaths({ rootDir: '/missing' }),
        router: new Hono(),
        container,
      });
      provider.register();
      container.instance(realtimeServiceToken, {
        defineTopic: () => ({ publishFor, close }),
      } as unknown as RealtimeService);
      const logger = {
        child: () => logger,
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      };
      container.instance(loggingToken, { getLogger: () => logger } as never);
      container.instance(userAdministrationServiceToken, {} as never);
      const dependencies = new Map<unknown, unknown>([
        [
          mailStoreToken,
          {
            getAccount: async () => ({
              id: 'account',
              userId: 'owner',
              status: 'active',
            }),
            getMessage: async () => ({
              id: 'message',
              accountId: 'account',
              providerMessageId: 'remote',
            }),
            updateMessageState: async () => ({
              id: 'message',
              accountId: 'account',
              note: 'note',
            }),
          },
        ],
        [mailProviderAdapterResolverToken, {}],
        [mailRuntimeToken, { close: async () => undefined }],
        [mailCredentialVaultToken, {}],
        [mailOutboundAttachmentStorageToken, {}],
      ]);
      const resolve = container.resolve.bind(container);
      vi.spyOn(container, 'resolve').mockImplementation(
        <T>(token: ServiceToken<T>): T =>
          dependencies.has(token)
            ? (dependencies.get(token) as T)
            : resolve(token),
      );
      if (!early) await provider.boot();
      const service = container.resolve(mailServiceToken);
      if (early) await provider.boot();
      await service.updateMessage(
        { actorId: 'owner' },
        { accountId: 'account', messageId: 'message', note: 'note' },
      );
      expect(publishFor).toHaveBeenCalledWith('owner', {
        kind: 'mail.changed',
      });
      await provider.shutdown();
      publishFor.mockClear();
      await service.updateMessage(
        { actorId: 'owner' },
        { accountId: 'account', messageId: 'message', note: 'note' },
      );
      expect(publishFor).not.toHaveBeenCalled();
    },
  );

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
