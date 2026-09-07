import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { defineApiRoutes, defineRootRoutes } from '@nocobase/app-server/router';
import i18nPlugin from '@nocobase/app-plugin-i18n/server';
import { i18nAuditToken } from '@nocobase/app-plugin-i18n/server/audit';
import { I18nRuntime } from '@nocobase/i18n';
import { i18nToken } from '@nocobase/app-server/i18n';
import { inAppNotificationAuditToken } from '@nocobase/app-plugin-notification-in-app/server/audit';
import { Hono } from 'hono';

import {
  createSessionManager,
  createSessionMiddleware,
} from '@nocobase/session';
import { defineHttpMiddleware } from '@nocobase/app-server/router';
import { createInAppRouter } from '@nocobase/app-plugin-notification-in-app/server';
import systemInfoPlugin from '@nocobase/app-plugin-system-info/server';

function createSessions() {
  return createSessionManager({
    default: 'memory',
    stores: { memory: { driver: 'memory' } },
    cookie: { name: 'audit_session' },
    secret: 'ADMIN_SESSION_SECRET_AT_LEAST_32_CHARS',
    lifetime: { absolute: '2h' },
  });
}

describe.each(dialects)('administrative boundaries %s', (dialect) => {
  it('keeps readonly system information and configured installation status out of declared capture', async () => {
    const app = await createAdminAuditApp(dialect);
    for (const Provider of systemInfoPlugin.serviceProviders)
      new Provider(app.contributionApp).register();
    for (const route of systemInfoPlugin.routes)
      app.app.addRoutes(
        defineApiRoutes(() => route.createRouter(app.contributionApp)),
      );
    for (const route of installPlugin.routes)
      app.app.addRoutes(
        defineRootRoutes(() => route.createRouter(app.contributionApp)),
      );
    try {
      await app.start();
      expect((await app.request('/system-info')).status).toBe(401);
      const signup = await app.request(
        '/auth/sign-up/email',
        jsonRequest({
          email: 'reader@admin.example',
          username: 'adminreader',
          name: 'Reader',
          password: 'ADMIN_PASSWORD_SYNTHETIC_XXXXX',
        }),
      );
      const cookie = signup.headers.get('set-cookie')!;
      const count = (await app.events()).length;
      expect(
        (await app.request('/system-info', { headers: { cookie } })).status,
      ).toBe(200);
      expect(
        (await app.app.fetch(new Request('http://localhost/install/status')))
          .status,
      ).toBe(200);
      expect(
        (
          await app.app.fetch(
            new Request(
              'http://localhost/install/configure',
              jsonRequest(valid),
            ),
          )
        ).status,
      ).toBe(404);
      expect((await app.events()).length).toBe(count);
    } finally {
      await app.close();
    }
  });

  it('persists the real locale session while keeping unverified session user keys anonymous', async () => {
    const app = await createAdminAuditApp(dialect);
    const sessions = createSessions();
    const i18n = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['en-US', 'zh-CN'],
    });
    await i18n.init('en-US');
    app.app.container.instance(i18nToken, i18n);
    app.app.container.instance(i18nAuditToken, {
      http: (input) => app.collector.http(input),
    });
    app.app.addHttpMiddleware(
      defineHttpMiddleware({
        name: 'admin-session',
        register(router) {
          router.use('*', createSessionMiddleware(sessions));
        },
      }),
    );
    const seeded = sessions.createRequestSession({});
    await seeded.set('userId', 'ADMIN_FORGED_SESSION_USER');
    const persisted = await seeded.persist();
    for (const route of i18nPlugin.routes)
      app.app.addRoutes(
        defineApiRoutes(() => route.createRouter(app.contributionApp)),
      );
    try {
      await app.start();
      const response = await app.request(
        '/i18n/locale',
        jsonRequest(
          { locale: 'zh-CN' },
          'audit_session=' + persisted.cookieValue,
        ),
      );
      expect(response.status).toBe(200);
      const saved = sessions.createRequestSession({
        cookieValue: persisted.cookieValue,
      });
      expect(await saved.get()).toMatchObject({ locale: 'zh-CN' });
      const events = await app.events();
      expect(events).toHaveLength(1);
      expect(events[0].actor).toEqual({ type: 'anonymous' });
      expect(JSON.stringify(events)).not.toContain('ADMIN_FORGED_SESSION_USER');
    } finally {
      await sessions.dispose();
      await app.close();
    }
  });

  it('preserves legacy inbox fallback responses without claiming its user key as authenticated audit identity', async () => {
    const app = await createAdminAuditApp(dialect);
    const notifications = await addNotifications(app);
    const sessions = createSessions();
    const seeded = sessions.createRequestSession({});
    await seeded.set('userId', 'ADMIN_FORGED_SESSION_USER');
    const persisted = await seeded.persist();
    const cookie = 'audit_session=' + persisted.cookieValue;
    app.app.addHttpMiddleware(
      defineHttpMiddleware({
        name: 'admin-fallback-session',
        register(router) {
          router.use('*', createSessionMiddleware(sessions));
        },
      }),
    );
    const bridge = app.app.container.resolve(inAppNotificationAuditToken);
    app.app.addRoutes(
      defineApiRoutes(() => {
        const router = new Hono();
        router.get(
          '/fallback/audit/unread-count',
          bridge.http({ action: 'notification.fallback.count' }),
        );
        router.route(
          '/fallback/audit',
          createInAppRouter(notifications.store, { audit: bridge }),
        );
        router.route('/fallback/plain', createInAppRouter(notifications.store));
        return router;
      }),
    );
    try {
      await app.start();
      for (const headers of [new Headers(), new Headers({ cookie })]) {
        const a = await app.request('/fallback/audit/unread-count', {
          headers,
        });
        const b = await app.request('/fallback/plain/unread-count', {
          headers,
        });
        expect(a.status).toBe(b.status);
        expect(await a.json()).toEqual(await b.json());
      }
      const events = (await app.events()).filter(
        (event) => event.action === 'notification.fallback.count',
      );
      expect(events).toHaveLength(2);
      expect(events.every((event) => event.actor.type === 'anonymous')).toBe(
        true,
      );
      expect(events.map((event) => event.outcome).sort()).toEqual([
        'denied',
        'success',
      ]);
    } finally {
      await sessions.dispose();
      await notifications.close();
      await app.close();
    }
  });

  it('keeps concurrent verified users isolated and matches no-bridge inbox responses', async () => {
    for (const enabled of [false, true]) {
      const app = await createAdminAuditApp(dialect);
      const notifications = await addNotifications(app, enabled);
      try {
        await app.start();
        const users = [];
        for (const name of ['first', 'second']) {
          const response = await app.request(
            '/auth/sign-up/email',
            jsonRequest({
              email: name + '@admin.example',
              username: 'admin' + name,
              name,
              password: 'ADMIN_PASSWORD_SYNTHETIC_XXXXX',
            }),
          );
          const body: { user: { id: string } } = await response.json();
          users.push({
            id: body.user.id,
            cookie: response.headers.get('set-cookie')!,
          });
        }
        const before = (await app.events()).length;
        const responses = await Promise.all(
          users.map((user) =>
            app.request('/notifications/in-app/unread-count', {
              headers: {
                cookie: user.cookie,
                'x-user-id': 'ADMIN_FORGED_HEADER_USER',
              },
            }),
          ),
        );
        for (const response of responses) {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ count: 0 });
        }
        const denied = await app.request('/notifications/in-app/unread-count');
        expect(denied.status).toBe(401);
        expect(await denied.json()).toEqual({
          error: 'Authentication required.',
        });
        const events = (await app.events())
          .slice(0, (await app.events()).length - before)
          .filter((event) => event.action === 'notification.inbox.count');
        if (enabled) {
          expect(events).toHaveLength(3);
          expect(
            events
              .filter((event) => event.outcome === 'success')
              .map((event) => event.actor.id)
              .sort(),
          ).toEqual(users.map((user) => user.id).sort());
          expect(
            events.find((event) => event.outcome === 'denied')?.actor.type,
          ).toBe('anonymous');
          expect(new Set(events.map((event) => event.operationId)).size).toBe(
            3,
          );
        } else expect(events).toHaveLength(0);
      } finally {
        await notifications.close();
        await app.close();
      }
    }
  });
});

import { createAdminAuditApp, jsonRequest } from '../helpers/admin-fixture.js';
import { dialects } from '../helpers/database-fixtures.js';
import { addNotifications } from '../helpers/admin-fixture.js';

describe.each(dialects)('notification administration %s', (dialect) => {
  it('uses real authentication, permissions, database delivery and accepted HTTP observations', async () => {
    const app = await createAdminAuditApp(dialect);
    const notifications = await addNotifications(app);
    try {
      await app.start();
      expect(() =>
        app.collector.validateRoutes(app.app.router.routes),
      ).not.toThrow();
      const signup = await app.request(
        '/auth/sign-up/email',
        jsonRequest({
          email: 'admin@admin.example',
          username: 'adminadmin',
          name: 'Admin',
          password: 'ADMIN_SYNTHETIC_PASSWORD_XXXXXXXX',
        }),
      );
      expect(signup.status).toBe(200);
      const body: { user: { id: string } } = await signup.json();
      const cookie = signup.headers.get('set-cookie')!;
      const call = (path: string, method: string = 'GET', data: object = {}) =>
        app.request(path, {
          ...jsonRequest(data, cookie),
          method,
          body: method === 'GET' ? undefined : JSON.stringify(data),
          headers: {
            ...jsonRequest(data, cookie).headers,
            'x-nocobase-notification-test': '1',
          },
        });
      expect((await app.request('/notifications/test/targets')).status).toBe(
        401,
      );
      expect((await call('/notifications/test/targets')).status).toBe(403);
      await notifications.authz.permissionSets.create({
        key: 'admin-admin',
        grants: [
          {
            resource: { type: 'notification', id: 'test' },
            actions: [{ action: 'send' }],
          },
          {
            resource: { type: 'page', id: 'notification.logs' },
            actions: [{ action: 'access' }],
          },
        ],
      });
      await notifications.authz.permissionSets.assign({
        permissionSet: 'admin-admin',
        subject: { type: 'user', id: body.user.id },
      });
      expect((await call('/notifications/test/targets')).status).toBe(200);
      const response = await call('/notifications/test/send', 'POST', {
        channel: 'in-app',
        provider: { name: 'primary', type: 'database' },
        values: { title: 'ADMIN_PRIVATE_TITLE', body: secret },
      });
      expect(response.status).toBe(202);
      const sent: { data: { notificationId: string } } = await response.json();
      expect(
        (
          await call(
            '/notifications/test/' + sent.data.notificationId + '/status',
          )
        ).status,
      ).toBe(200);
      expect((await call('/notifications/test/missing/status')).status).toBe(
        404,
      );
      expect((await call('/notifications/test/send', 'POST', {})).status).toBe(
        400,
      );
      expect((await call('/notifications/logs')).status).toBe(200);
      expect(
        (await call('/notifications/logs/' + sent.data.notificationId)).status,
      ).toBe(200);
      expect((await call('/notifications/logs/missing')).status).toBe(404);
      expect((await app.request('/notifications/logs')).status).toBe(401);
      expect((await app.request('/notifications/in-app')).status).toBe(401);
      expect((await call('/notifications/in-app')).status).toBe(200);
      expect((await call('/notifications/in-app/unread-count')).status).toBe(
        200,
      );
      expect(
        (await call('/notifications/in-app/read-all', 'POST')).status,
      ).toBe(403);
      const csrf: { token: string } = await (
        await call('/notifications/in-app/csrf')
      ).json();
      const mutate = (path: string, data: object = {}) =>
        app.request(path, {
          ...jsonRequest(
            data,
            cookie + '; notification_in_app_csrf=' + csrf.token,
          ),
          headers: {
            ...jsonRequest(
              data,
              cookie + '; notification_in_app_csrf=' + csrf.token,
            ).headers,
            'x-csrf-token': csrf.token,
          },
        });
      expect((await mutate('/notifications/in-app/read-all')).status).toBe(200);
      expect((await mutate('/notifications/in-app/read%2Dall')).status).toBe(
        200,
      );
      expect((await mutate('/notifications/in-app/read-all/')).status).toBe(
        404,
      );
      const rows = await notifications.store.list({ userId: body.user.id });
      expect(rows.length).toBeGreaterThan(0);
      expect(
        (
          await mutate('/notifications/in-app/' + rows[0].id, {
            action: 'unread',
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await mutate('/notifications/in-app/' + rows[0].id, {
            action: 'delete',
          })
        ).status,
      ).toBe(200);
      expect((await mutate('/notifications/in-app/missing')).status).toBe(404);
      expect(
        (await app.request('/notifications/in-app/unread-count')).status,
      ).toBe(401);
      const events = (await app.events()).filter((event) =>
        event.action.startsWith('notification.'),
      );
      expect(
        events.find(
          (event) =>
            event.action === 'notification.test.send' &&
            event.outcome === 'accepted',
        )?.actor,
      ).toEqual({ type: 'user', id: body.user.id });
      expect(
        events.some(
          (event) =>
            event.action === 'notification.inbox.list' &&
            event.actor.type === 'anonymous' &&
            event.outcome === 'denied',
        ),
      ).toBe(true);
      expect(
        events
          .filter((event) => event.outcome === 'success')
          .every((event) => event.actor.id === body.user.id),
      ).toBe(true);
      const expectedEvents = [
        ['notification.test.targets', 'denied', 'anonymous', 1],
        ['notification.test.targets', 'denied', 'user', 1],
        ['notification.test.targets', 'success', 'user', 1],
        ['notification.test.send', 'accepted', 'user', 1],
        ['notification.test.send', 'failed', 'user', 1],
        ['notification.test.status', 'success', 'user', 1],
        ['notification.test.status', 'failed', 'user', 1],
        ['notification.logs.list', 'success', 'user', 1],
        ['notification.logs.list', 'denied', 'anonymous', 1],
        ['notification.logs.get', 'success', 'user', 1],
        ['notification.logs.get', 'failed', 'user', 1],
        ['notification.inbox.list', 'success', 'user', 1],
        ['notification.inbox.list', 'denied', 'anonymous', 1],
        ['notification.inbox.count', 'success', 'user', 1],
        ['notification.inbox.count', 'denied', 'anonymous', 1],
        ['notification.inbox.readAll', 'success', 'user', 2],
        ['notification.inbox.readAll', 'denied', 'user', 1],
        ['notification.inbox.update', 'success', 'user', 2],
        ['notification.inbox.update', 'failed', 'user', 1],
      ] as const;
      for (const [action, outcome, actorType, count] of expectedEvents) {
        const matching = events.filter(
          (event) =>
            event.action === action &&
            event.outcome === outcome &&
            event.actor.type === actorType,
        );
        expect(matching).toHaveLength(count);
        for (const event of matching)
          expect(event.actor).toEqual(
            actorType === 'user'
              ? { type: 'user', id: body.user.id }
              : { type: 'anonymous' },
          );
      }
      for (const event of events) {
        expect(event.producer).toBe('audit.http');
        expect(event.kind).toBe('request');
        expect(event.appId).toBe(app.fixture.scope.appId);
        expect(event.store).toBe('main');
        expect(event.source).toBeUndefined();
        expect(event.target).toBeUndefined();
      }
      expect(JSON.stringify(events)).not.toContain(secret);
      expect(JSON.stringify(events)).not.toContain('ADMIN_PRIVATE_TITLE');
    } finally {
      await notifications.close();
      await app.close();
    }
  });
});

import installPlugin from '@nocobase/app-plugin-install/server';
import { installAuditToken } from '@nocobase/app-plugin-install/server/audit';

const secret = 'ADMIN_SYNTHETIC_DATABASE_PASSWORD';

describe.each(dialects)('installation audit policy %s', (dialect) => {
  it('requires committed evidence only for explicit required deployments and keeps bootstrap optional', async () => {
    for (const required of [false, true])
      for (const state of ['disabled', 'excluded', 'pending-commit'] as const) {
        const app = await createAdminAuditApp(dialect, undefined, true, true);
        const diagnostic = vi
          .spyOn(console, 'error')
          .mockImplementation(() => undefined);
        app.app.container.instance(installAuditToken, {
          required,
          http: (input) => app.collector.http(input),
          record: async () => ({ state }),
        });
        for (const route of installPlugin.routes)
          app.app.addRoutes(
            defineRootRoutes(() => route.createRouter(app.contributionApp)),
          );
        try {
          await app.start();
          const response = await app.app.fetch(
            new Request(
              'http://localhost/install/configure',
              jsonRequest(valid),
            ),
          );
          expect(response.status).toBe(required ? 503 : 201);
          if (required)
            await expect(
              stat(app.app.paths.root('config.yml')),
            ).rejects.toMatchObject({ code: 'ENOENT' });
          else
            expect(
              (await stat(app.app.paths.root('config.yml'))).isFile(),
            ).toBe(true);
          expect(
            (await app.events()).some((event) => event.kind === 'business'),
          ).toBe(false);
        } finally {
          diagnostic.mockRestore();
          await app.close();
        }
      }
    const app = await createAdminAuditApp(dialect, undefined, false, true);
    for (const route of installPlugin.routes)
      app.app.addRoutes(
        defineRootRoutes(() => route.createRouter(app.contributionApp)),
      );
    try {
      await app.start();
      const response = await app.app.fetch(
        new Request('http://localhost/install/configure', jsonRequest(valid)),
      );
      expect(response.status).toBe(201);
      expect(await app.events()).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});

const valid = {
  dialect: 'postgres',
  host: '127.0.0.1',
  port: 26432,
  username: 'synthetic',
  password: secret,
  database: 'synthetic',
  schema: 'public',
};

describe.each(dialects)('administrative producers %s', (dialect) => {
  it('separates persisted configuration stages from HTTP without claiming database installation', async () => {
    const app = await createAdminAuditApp(dialect, undefined, true, true);
    app.app.container.instance(installAuditToken, {
      http: (input) => app.collector.http(input),
      record: (input) => app.runtime.recorder.record(input),
    });
    for (const route of installPlugin.routes)
      app.app.addRoutes(
        defineRootRoutes(() => route.createRouter(app.contributionApp)),
      );
    try {
      await app.start();
      const request = (body: object) =>
        app.app.fetch(
          new Request('http://localhost/install/configure', jsonRequest(body)),
        );
      expect((await request({ dialect: 'unsupported' })).status).toBe(400);
      const response = await request(valid);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        configured: true,
        restartRequired: true,
      });
      expect((await stat(app.app.paths.root('config.yml'))).mode & 0o777).toBe(
        0o600,
      );
      expect(
        await readFile(app.app.paths.root('config.yml'), 'utf8'),
      ).toContain(secret);
      expect((await request(valid)).status).toBe(409);
      const events = await app.events();
      expect(
        events.filter(
          (event) => event.action === 'install.configure.attempted',
        ),
      ).toHaveLength(3);
      expect(
        events.filter(
          (event) => event.action === 'install.configure.completed',
        ),
      ).toHaveLength(1);
      expect(
        events.filter((event) => event.action === 'install.configure.failed'),
      ).toHaveLength(2);
      expect(
        events
          .filter((event) => event.action === 'install.configure')
          .map((event) => event.outcome)
          .sort(),
      ).toEqual(['failed', 'failed', 'success']);
      expect(events.every((event) => event.actor.type === 'anonymous')).toBe(
        true,
      );
      expect(JSON.stringify(events)).not.toContain(secret);
      expect(JSON.stringify(events)).not.toContain(
        'ADMIN_SYNTHETIC_AUTH_SECRET',
      );
      const completed = events.find(
        (event) => event.action === 'install.configure.completed',
      )!;
      expect(
        events.filter((event) => event.operationId === completed.operationId),
      ).toHaveLength(3);
    } finally {
      await app.close();
    }
  });

  it('blocks failed attempt persistence without replaying a completed write when its observation fails', async () => {
    const app = await createAdminAuditApp(dialect, undefined, true, true);
    let failAttempt = true;
    const diagnostic = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    app.app.container.instance(installAuditToken, {
      required: true,
      http: (input) => app.collector.http(input),
      record: async (input) => {
        if (failAttempt || input.action === 'install.configure.completed')
          throw new Error(secret);
        return app.runtime.recorder.record(input);
      },
    });
    for (const route of installPlugin.routes)
      app.app.addRoutes(
        defineRootRoutes(() => route.createRouter(app.contributionApp)),
      );
    try {
      await app.start();
      const request = () =>
        app.app.fetch(
          new Request('http://localhost/install/configure', jsonRequest(valid)),
        );
      const failed = await request();
      expect(failed.status).toBe(503);
      expect(await failed.text()).not.toContain(secret);
      await expect(
        stat(app.app.paths.root('config.yml')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      failAttempt = false;
      expect((await request()).status).toBe(201);
      expect((await request()).status).toBe(409);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(secret);
      expect(diagnostic).toHaveBeenCalledWith(
        'Installation audit observation unavailable.',
        { code: 'INSTALL_AUDIT_WRITE_FAILED' },
      );
      const events = await app.events();
      expect(
        events.some(
          (event) =>
            event.action === 'install.configure' && event.outcome === 'success',
        ),
      ).toBe(true);
      expect(
        events.some((event) => event.action === 'install.configure.completed'),
      ).toBe(false);
    } finally {
      diagnostic.mockRestore();
      await app.close();
    }
  });

  it('captures public locale preference outcomes without collecting readonly inventory', async () => {
    const app = await createAdminAuditApp(dialect);
    const i18n = new I18nRuntime({
      defaultLocale: 'en-US',
      locales: ['en-US', 'zh-CN'],
    });
    await i18n.init('en-US');
    app.app.container.instance(i18nToken, i18n);
    app.app.container.instance(i18nAuditToken, {
      http: (input) => app.collector.http(input),
    });
    for (const route of i18nPlugin.routes)
      app.app.addRoutes(
        defineApiRoutes(() => route.createRouter(app.contributionApp)),
      );
    try {
      await app.start();
      expect((await app.request('/i18n/locales')).status).toBe(200);
      expect(
        (
          await app.request(
            '/i18n/locale',
            jsonRequest({ locale: 'zh-CN', userId: 'FORGED_USER' }),
          )
        ).status,
      ).toBe(200);
      expect(
        (await app.request('/i18n/locale', jsonRequest({ locale: secret })))
          .status,
      ).toBe(400);
      const events = await app.events();
      expect(events).toHaveLength(2);
      expect(
        events.every(
          (event) =>
            event.action === 'i18n.locale.change' &&
            event.actor.type === 'anonymous',
        ),
      ).toBe(true);
      expect(events.map((event) => event.outcome).sort()).toEqual([
        'failed',
        'success',
      ]);
      expect(JSON.stringify(events)).not.toContain(secret);
      expect(JSON.stringify(events)).not.toContain('FORGED_USER');
      expect(
        app.collector
          .describeRoutes(app.app.router.routes)
          .some((route) => route.action === 'i18n.locale.change'),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });
});
