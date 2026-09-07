import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import routes from '../client/routes.js';

describe('Mail client routes', () => {
  it('contributes lazy application, Settings, and development routes', async () => {
    expect(routes).toHaveLength(3);
    const [app, settings, dev] = routes;
    expect(app).toMatchObject({
      parent: 'app',
      routes: [
        {
          name: 'mail',
          path: '/mail',
          auth: 'required',
          componentLoader: expect.any(Function),
        },
      ],
    });
    expect(settings).toMatchObject({
      parent: 'settings',
      routes: [
        {
          name: 'mail',
          path: '/mail',
          navigation: { title: 'nav.settings' },
          children: [
            {
              name: 'my-accounts',
              path: '/my-accounts',
              navigation: { title: 'nav.myAccounts' },
              access: { resource: 'mail.settings', action: 'access' },
              componentLoader: expect.any(Function),
            },
            {
              name: 'accounts',
              path: '/accounts',
              navigation: { title: 'nav.accounts' },
              access: { resource: 'mail.settings', action: 'access' },
              componentLoader: expect.any(Function),
            },
            {
              name: 'operation-logs',
              path: '/send-logs',
              navigation: { title: 'nav.operationLogs' },
              access: { resource: 'mail.settings', action: 'access' },
              componentLoader: expect.any(Function),
            },
          ],
        },
      ],
    });
    expect(dev).toMatchObject({
      parent: 'dev',
      routes: [
        {
          name: 'mail',
          path: '/mail',
          navigation: { title: 'nav.dev' },
          children: [
            {
              name: 'accounts',
              path: '/accounts',
              navigation: { title: 'nav.devAccounts' },
              access: { resource: 'mail.settings', action: 'access' },
              componentLoader: expect.any(Function),
            },
            {
              name: 'center',
              path: '/center',
              navigation: { title: 'nav.devCenter' },
              access: { resource: 'mail.settings', action: 'access' },
              componentLoader: expect.any(Function),
            },
            {
              name: 'management',
              path: '/management',
              navigation: { title: 'nav.devManagement' },
              access: { resource: 'mail.settings', action: 'access' },
              componentLoader: expect.any(Function),
            },
            {
              name: 'send',
              path: '/send',
              navigation: { title: 'nav.devSend' },
              access: { resource: 'mail.settings', action: 'access' },
              componentLoader: expect.any(Function),
            },
            {
              name: 'sync-logs',
              path: '/sync-logs',
              navigation: { title: 'nav.syncLogs' },
              access: { resource: 'mail.settings', action: 'access' },
              componentLoader: expect.any(Function),
            },
            {
              name: 'send-logs',
              path: '/send-logs',
              navigation: { title: 'nav.sendLogs' },
              access: { resource: 'mail.settings', action: 'access' },
              componentLoader: expect.any(Function),
            },
          ],
        },
      ],
    });

    if (app?.parent !== 'app') {
      throw new Error('Missing Mail application route contribution.');
    }
    if (settings?.parent !== 'settings') {
      throw new Error('Missing Mail Settings route contribution.');
    }
    if (dev?.parent !== 'dev') {
      throw new Error('Missing Mail client route contribution.');
    }
    await expect(app.routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
    await expect(
      settings.routes[0]?.children?.[0]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
    await expect(
      settings.routes[0]?.children?.[1]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
    await expect(
      settings.routes[0]?.children?.[2]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
    await expect(
      dev.routes[0]?.children?.[0]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
    await expect(
      dev.routes[0]?.children?.[1]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
    await expect(
      dev.routes[0]?.children?.[2]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
    await expect(
      dev.routes[0]?.children?.[3]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
    await expect(
      dev.routes[0]?.children?.[4]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });
    await expect(
      dev.routes[0]?.children?.[5]?.componentLoader(),
    ).resolves.toMatchObject({ default: expect.any(Function) });

    const resolved = resolveAppClientContributions([
      { packageName: '@nocobase/app-plugin-mail', routes },
    ]);
    expect(resolved.routes.map((route) => route.path)).toEqual(['/mail']);
    expect(resolved.settingGroups).toMatchObject([
      { id: 'mail', title: 'nav.settings' },
    ]);
    expect(resolved.settings.map((route) => route.path)).toEqual([
      '/settings/mail/my-accounts',
      '/settings/mail/accounts',
      '/settings/mail/send-logs',
    ]);
    expect(resolved.devRoutes.map((route) => route.path)).toEqual([
      '/dev/mail/accounts',
      '/dev/mail/center',
      '/dev/mail/management',
      '/dev/mail/send',
      '/dev/mail/sync-logs',
      '/dev/mail/send-logs',
    ]);
  });
});
