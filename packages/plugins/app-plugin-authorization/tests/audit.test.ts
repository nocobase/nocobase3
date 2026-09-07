import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMigrator, databaseManagerToken } from '@nocobase/db';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  createAuditAuthApp,
  jsonRequest,
} from '../../app-plugin-authentication/server/tests/helpers/audit-app.js';
import { dialects } from '../../app-plugin-audit/tests/helpers/database-fixtures.js';
import { createAppAuthorization } from '../server/authorization.js';
import { authorizationToken } from '../server/tokens.js';
import { apiRoutes } from '../server/routes/index.js';
import { Hono } from 'hono';

describe.each(dialects)('authorization audit %s', (dialect) => {
  it('uses real permissions and persists management outcomes including factory routes without denied targets', async () => {
    const app = await createAuditAuthApp(dialect, async (host) => {
      const database = host.container.resolve(databaseManagerToken);
      await createMigrator({
        database,
        packageName: '@nocobase/app-plugin-authorization',
        directory: fileURLToPath(
          new URL('../database/migrations', import.meta.url),
        ),
      }).latest();
      host.container.instance(
        authorizationToken,
        createAppAuthorization({ connection: database.connection() }),
      );
      host.addRoutes(
        defineApiRoutes(() =>
          apiRoutes.createRouter({
            appName: 'synthetic-app',
            publicBasePath: '',
            config: host.config,
            paths: host.paths,
            router: new Hono(),
            container: host.container,
          }),
        ),
      );
    });
    try {
      const signup = await app.request(
        '/auth/sign-up/email',
        jsonRequest({
          email: 'admin@auth.example',
          username: 'authadmin',
          name: 'Admin',
          password: 'AUTH_SECRET_PASSWORD_XXXXXXXX',
        }),
      );
      expect(signup.status).toBe(200);
      const user = (await signup.json()).user;
      const cookie = signup.headers.get('set-cookie')!;
      const authz = app.app.container.resolve(authorizationToken);
      const call = (path: string, method: string, body: object = {}) =>
        app.request('/authz' + path, {
          ...jsonRequest(body, cookie),
          method,
          ...(method === 'GET' ? { body: undefined } : {}),
        });
      const statements: string[] = [];
      const capture = (query: { sql: string }): void => {
        statements.push(query.sql);
      };
      const client = await app.fixture.connection.client<{
        on(event: 'query', listener: typeof capture): void;
        removeListener(event: 'query', listener: typeof capture): void;
      }>();
      client.on('query', capture);
      expect(
        (await app.request('/authz/permission-sets', jsonRequest({}))).status,
      ).toBe(401);
      expect(
        (
          await call('/permission-sets', 'POST', {
            key: 'AUTH_DENIED_TARGET',
            grants: [],
          })
        ).status,
      ).toBe(403);
      client.removeListener('query', capture);
      expect(
        statements.filter(
          (sql) =>
            /\b(insert|update|delete)\b/i.test(sql) &&
            /authorization_?permission_?sets/i.test(sql),
        ),
      ).toEqual([]);
      expect(
        await authz.permissionSets.get('AUTH_DENIED_TARGET'),
      ).toBeUndefined();
      await authz.permissionSets.create({
        key: 'auth-admin',
        grants: [
          'permission-sets',
          'default-access',
          'sharing-rules',
          'restriction-rules',
        ].map((id) => ({
          resource: { type: 'authorization.settings', id },
          actions: ['read', 'create', 'update', 'delete'].map((action) => ({
            action,
          })),
        })),
      });
      await authz.permissionSets.assign({
        permissionSet: 'auth-admin',
        subject: { type: 'user', id: user.id },
      });
      const operations = [
        ['/permission-sets', 'POST', { key: 'auth-reader', grants: [] }, 201],
        [
          '/permission-sets/auth-reader',
          'PUT',
          { key: 'auth-reader', grants: [], title: 'Reader' },
          200,
        ],
        [
          '/permission-sets/auth-reader/assignments',
          'POST',
          { subject: { type: 'user', id: user.id } },
          201,
        ],
        ['/permission-sets', 'POST', { key: 'invalid' }, 400],
        ['/permission-sets/system-administrator', 'DELETE', {}, 403],
        [
          '/default-access',
          'PUT',
          {
            resource: { type: 'database.collection', id: 'main.orders' },
            actions: [{ action: 'read', scope: { type: 'all' } }],
          },
          200,
        ],
        ['/default-access/database.collection/main.orders', 'DELETE', {}, 204],
        [
          '/sharing-rules',
          'POST',
          {
            key: 'auth-sharing',
            resource: { type: 'database.collection', id: 'main.orders' },
            subjects: [{ type: 'user', id: user.id }],
            actions: [
              { action: 'read', selection: { type: 'records', ids: ['1'] } },
            ],
          },
          201,
        ],
        [
          '/sharing-rules/auth-sharing',
          'PUT',
          {
            key: 'auth-sharing',
            resource: { type: 'database.collection', id: 'main.orders' },
            subjects: [{ type: 'user', id: user.id }],
            actions: [
              { action: 'read', selection: { type: 'records', ids: ['2'] } },
            ],
          },
          200,
        ],
        ['/sharing-rules/auth-sharing', 'DELETE', {}, 204],
        [
          '/restriction-rules',
          'POST',
          {
            key: 'auth-restriction',
            resource: { type: 'database.collection', id: 'main.orders' },
            subjects: [{ type: 'user', id: user.id }],
            actions: [{ action: 'read', scope: { type: 'all' } }],
          },
          201,
        ],
        [
          '/restriction-rules/auth-restriction',
          'PUT',
          {
            key: 'auth-restriction',
            resource: { type: 'database.collection', id: 'main.orders' },
            subjects: [{ type: 'user', id: user.id }],
            actions: [{ action: 'read', scope: { type: 'all' } }],
          },
          200,
        ],
        ['/restriction-rules/auth-restriction', 'DELETE', {}, 204],
        ['/permission-sets/auth-reader', 'DELETE', {}, 204],
      ] as const;
      for (const [path, method, body, status] of operations) {
        const before = new Set((await app.events()).map((e) => e.id));
        const response = await call(path, method, body);
        expect(response.status).toBe(status);
        const events = (await app.events()).filter((e) => !before.has(e.id));
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          actor: { type: 'user', id: user.id },
          outcome:
            status === 403 ? 'denied' : status >= 400 ? 'failed' : 'success',
        });
        expect(events[0].action).toBe(
          `authorization.${path.split('/')[1]}.${{ POST: 'create', PUT: 'update', DELETE: 'delete' }[method]}`,
        );
      }
      const denied = (await app.events()).filter((e) => e.outcome === 'denied');
      expect(denied).toHaveLength(3);
      expect(denied.every((e) => !e.target && !e.details)).toBe(true);
      expect(JSON.stringify(await app.events())).not.toContain(
        'AUTH_DENIED_TARGET',
      );
      expect(JSON.stringify(await app.events())).not.toContain(
        'AUTH_SECRET_PASSWORD',
      );
    } finally {
      await app.close();
    }
  });
});
