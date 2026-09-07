// @vitest-environment node
import { createI18nMiddleware } from '@nocobase/i18n/server';
import { createFileI18nRuntime } from './i18n.js';
import serverLocales from '../server/locales/index.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createDriveManager } from '@nocobase/drive';
import { createMigrator } from '@nocobase/db';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  createAppAuthorization,
  authorizationToken,
} from '@nocobase/app-plugin-authorization';
import { createAuditDatabaseCollector } from '@nocobase/app-plugin-audit/server';
import { dialects } from '../../app-plugin-audit/tests/helpers/database-fixtures.js';
import { createAuditAuthApp, jsonRequest } from './helpers/audit-app.js';
import { createFileRoute } from '../server/index.js';
import { fileSettingsApiRoutes } from '../server/settings/routes.js';
import { FILE_INVENTORY_RESOURCE } from '../shared/settings/inventory.js';
import type { FileAudit } from '../server/types.js';

const BODY = 'G16_FILE_BODY_SECRET_SENTINEL';
const SECRET = 'G16_TOKEN_SECRET_SENTINEL_at_least_32_characters';
const STORAGE_SECRET = 'G16_S3_SECRET_SENTINEL';

async function setup(dialect: (typeof dialects)[number], enabled = true) {
  const host = await createAuditAuthApp(dialect);
  const database = host.fixture.manager;
  const i18n = await createFileI18nRuntime(serverLocales);
  host.app.addRoutes(
    defineApiRoutes(() => new Hono().use('*', createI18nMiddleware(i18n))),
  );
  for (const table of ['g16Files', 'g16OtherFiles']) {
    await database.builder().createCollection(table, (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('orderId', { length: 64 });
      collection.string('disk', { length: 64 }).notNull();
      collection.string('key', { length: 512 }).notNull();
      collection.string('filename', { length: 255 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').unsigned().notNull();
      collection.boolean('public').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_' + table });
    });
  }
  await createMigrator({
    database,
    packageName: '@nocobase/app-plugin-authorization',
    directory: fileURLToPath(
      new URL(
        '../../app-plugin-authorization/database/migrations',
        import.meta.url,
      ),
    ),
  }).latest();
  const authorization = createAppAuthorization({
    connection: database.connection(),
  });
  host.app.container.instance(authorizationToken, authorization);
  const drive = createDriveManager({
    default: 'local',
    links: {},
    disks: {
      local: {
        driver: 'fs',
        location: join(host.fixture.directory, 'storage'),
        visibility: 'private',
      },
    },
  });
  const audit: FileAudit = {
    http: (declaration) => host.collector.http(declaration),
    markHttpResult: (context, result) =>
      host.collector.markHttpResult(context, result),
    record: (event) => host.runtime.recorder.record(event),
  };
  host.app.addRoutes(
    defineApiRoutes(() => {
      const routes = new Hono();
      for (const [path, table] of [
        ['/files', 'g16Files'],
        ['/other-files', 'g16OtherFiles'],
        ['/orders/:orderId/files', 'g16OtherFiles'],
        ['/broken-source', 'g16Files'],
      ]) {
        routes.route(
          path,
          createFileRoute({
            database,
            table,
            drive,
            defaultDisk: 'local',
            publicBasePath: '',
            tokenSecret: SECRET,
            audience: table,
            ...(path === '/broken-source'
              ? {
                  auditSource: () => {
                    throw new Error(STORAGE_SECRET);
                  },
                }
              : {}),
            ...(path.startsWith('/orders')
              ? {
                  scope: (context: import('hono').Context) => ({
                    orderId: context.req.param('orderId')!,
                  }),
                  auditSource: (context: import('hono').Context) => ({
                    resource: 'orders',
                    key: context.req.param('orderId')!,
                  }),
                }
              : {}),
            auth: host.auth.required(),
            authorize: async (context) => {
              const session = await host.auth.getSession(
                context.req.raw.headers,
              );
              if (
                !session ||
                !(await authorization
                  .for({ principal: { type: 'user', id: session.user.id } })
                  .can({
                    resource: { type: 'page', id: FILE_INVENTORY_RESOURCE },
                    action: 'access',
                  }))
              )
                return context.json({ error: 'Forbidden' }, 403);
            },
            visibility: { default: 'private', allowClientOverride: true },
            ...(enabled ? { audit } : {}),
          }),
        );
      }
      return routes;
    }),
  );
  host.app.addRoutes(
    defineApiRoutes(() =>
      fileSettingsApiRoutes.createRouter(host.contributionApp),
    ),
  );
  const targets = ['g16_files', 'g16_other_files'].map((table) => ({
    dataSource: 'main',
    table,
  }));
  const collector = await createAuditDatabaseCollector({
    connection: host.fixture.connection,
    store: host.fixture.store,
    configurationStore: host.fixture.store,
    settings: host.settings,
    scope: host.carrier,
    catalog: host.catalog,
    health: host.health,
    targets,
  });
  await host.start();
  const signup = await host.request(
    '/auth/sign-up/email',
    jsonRequest({
      name: 'G16 User',
      email: 'g16@example.com',
      password: 'G16-synthetic-password-123',
    }),
  );
  expect(signup.status).toBe(200);
  const cookie = signup.headers.get('set-cookie')!;
  const session = await host.auth.getSession(new Headers({ cookie }));
  if (!session) throw new Error('Expected real authenticated session.');
  const grant = async () => {
    await authorization.permissionSets.create({
      key: 'g16-file-access',
      grants: [
        {
          resource: { type: 'page', id: FILE_INVENTORY_RESOURCE },
          actions: [{ action: 'access' }],
        },
      ],
    });
    await authorization.permissionSets.assign({
      permissionSet: 'g16-file-access',
      subject: { type: 'user', id: session.user.id },
    });
  };
  const request = (path: string, init?: RequestInit) =>
    host.request(path, { ...init, headers: { cookie, ...init?.headers } });
  const upload = (path = '/files', isPublic = false) => {
    const body = new FormData();
    body.set(
      'file',
      new File([BODY], 'G16_FILENAME_SECRET.txt', { type: 'text/plain' }),
    );
    body.set('public', String(isPublic));
    return request(path, { method: 'POST', body });
  };
  return {
    ...host,
    audit,
    drive,
    cookie,
    userId: session.user.id,
    grant,
    request,
    upload,
    anonymous: host.request,
    close: async () => {
      await collector.dispose();
      await host.close();
    },
  };
}

for (const dialect of dialects)
  describe('file audit ' + dialect, () => {
    it('persists three correlated facts and real permissions across both factory mounts', async () => {
      const app = await setup(dialect);
      try {
        expect((await app.anonymous('/files')).status).toBe(401);
        expect((await app.upload()).status).toBe(403);
        expect((await app.request('/files/inventory/sources')).status).toBe(
          403,
        );
        await app.grant();
        for (const [path, resource] of [
          ['/files', 'g16Files'],
          ['/other-files', 'g16OtherFiles'],
        ]) {
          const uploaded = await app.upload(path);
          expect(uploaded.status).toBe(201);
          const { data } = (await uploaded.json()) as { data: { id: string } };
          const link = await app.request(path + '/' + data.id + '/token', {
            method: 'POST',
          });
          expect(link.status).toBe(200);
          const { data: access } = (await link.json()) as {
            data: { url: string };
          };
          expect(access.url).toContain('token=');
          expect(
            (
              await app.anonymous(
                path + '/' + data.id + '/content?token=G16_INVALID_TICKET',
              )
            ).status,
          ).toBe(403);
          const signed = await app.anonymous(access.url.replace('/api', ''));
          expect(signed.status).toBe(200);
          expect(await signed.text()).toBe(BODY);
          const refused = await app.anonymous(
            path + '/' + data.id + '/content',
          );
          expect(refused.status).toBe(403);
          expect(await refused.text()).not.toContain(BODY);
          expect((await app.request(path + '/' + data.id)).status).toBe(200);
          expect((await app.request(path)).status).toBe(200);
          expect(
            (await app.request(path + '/' + data.id, { method: 'DELETE' }))
              .status,
          ).toBe(204);
          const events = await app.events();
          const business = events.find(
            (e) =>
              e.action === 'file.upload-completed' &&
              e.target?.resource === resource,
          )!;
          expect(business).toMatchObject({
            kind: 'business',
            outcome: 'success',
            actor: { type: 'user', id: app.userId },
            target: { resource, key: data.id },
          });
          const same = events.filter(
            (e) => e.operationId === business.operationId,
          );
          expect(new Set(same.map((e) => e.kind))).toEqual(
            new Set(['business', 'request', 'database']),
          );
          expect(same.every((e) => e.actor.id === app.userId)).toBe(true);
          expect(
            events.some(
              (e) =>
                e.action === 'file.link-created' && e.target?.key === data.id,
            ),
          ).toBe(true);
          expect(
            events.some(
              (e) =>
                e.action === 'file.delete-completed' &&
                e.target?.key === data.id,
            ),
          ).toBe(true);
          expect(JSON.stringify(events)).not.toContain(
            new URL(access.url, 'http://localhost').searchParams.get('token'),
          );
        }
        expect((await app.request('/files/inventory/sources')).status).toBe(
          200,
        );
        expect(
          (await app.request('/files/inventory/sources/g16Files/files')).status,
        ).toBe(200);
        const events = await app.events();
        expect(events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'file.list',
              outcome: 'denied',
              actor: { type: 'anonymous' },
            }),
            expect.objectContaining({
              action: 'file.upload',
              outcome: 'denied',
              actor: { type: 'user', id: app.userId },
            }),
            expect.objectContaining({
              action: 'file.inventory.sources',
              outcome: 'success',
              actor: { type: 'user', id: app.userId },
            }),
            expect.objectContaining({
              action: 'file.inventory.files',
              outcome: 'success',
              actor: { type: 'user', id: app.userId },
            }),
          ]),
        );
        const serialized = JSON.stringify(events);
        for (const sentinel of [
          BODY,
          SECRET,
          STORAGE_SECRET,
          'G16_FILENAME_SECRET',
          'G16_INVALID_TICKET',
          'download-completed',
        ])
          expect(serialized).not.toContain(sentinel);
      } finally {
        await app.close();
      }
    }, 60000);

    it('records storage faults, missing files and stream cancellation without completed downloads', async () => {
      const app = await setup(dialect);
      try {
        await app.grant();
        const disk = app.drive.use('local');
        const put = vi
          .spyOn(disk, 'putStream')
          .mockRejectedValueOnce(new Error(STORAGE_SECRET));
        expect((await app.upload()).status).toBeGreaterThanOrEqual(400);
        expect(
          (await app.events()).filter(
            (e) => e.action === 'file.upload-completed',
          ),
        ).toHaveLength(0);
        put.mockRestore();
        const response = await app.upload('/files', true);
        expect(response.status).toBe(201);
        const { data } = (await response.json()) as { data: { id: string } };
        const path = '/files/' + data.id;
        const open = vi
          .spyOn(disk, 'getStream')
          .mockRejectedValueOnce(new Error(STORAGE_SECRET));
        expect((await app.anonymous(path + '/content')).status).toBe(503);
        open.mockRestore();
        const stream = new Readable({ read() {} });
        const controlled = vi
          .spyOn(disk, 'getStream')
          .mockResolvedValueOnce(stream);
        const content = await app.anonymous(path + '/content');
        expect(content.status).toBe(200);
        expect(content.bodyUsed).toBe(false);
        expect(content.body!.locked).toBe(false);
        await content.body!.cancel();
        expect(stream.destroyed).toBe(true);
        controlled.mockRestore();
        const broken = new Readable({ read() {} });
        const brokenOpen = vi
          .spyOn(disk, 'getStream')
          .mockResolvedValueOnce(broken);
        const brokenResponse = await app.anonymous(path + '/content');
        const consume = brokenResponse.text();
        broken.destroy(new Error(STORAGE_SECRET));
        await expect(consume).rejects.toThrow(STORAGE_SECRET);
        brokenOpen.mockRestore();
        expect((await app.anonymous('/files/missing/content')).status).toBe(
          404,
        );
        const remove = vi
          .spyOn(disk, 'delete')
          .mockRejectedValueOnce(new Error(STORAGE_SECRET));
        expect((await app.request(path, { method: 'DELETE' })).status).toBe(
          204,
        );
        remove.mockRestore();
        const events = await app.events();
        expect(events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'file.upload',
              outcome: 'failed',
            }),
            expect.objectContaining({
              action: 'file.content',
              outcome: 'failed',
            }),
            expect.objectContaining({
              action: 'file.content-request-processed',
              outcome: 'success',
            }),
            expect.objectContaining({
              action: 'file.storage-cleanup-failed',
              outcome: 'failed',
            }),
            expect.objectContaining({
              action: 'file.delete',
              outcome: 'failed',
            }),
          ]),
        );
        expect(events.some((e) => e.action === 'file.delete-completed')).toBe(
          false,
        );
        for (const sentinel of [
          BODY,
          SECRET,
          STORAGE_SECRET,
          'download-completed',
        ])
          expect(JSON.stringify(events)).not.toContain(sentinel);
      } finally {
        vi.restoreAllMocks();
        await app.close();
      }
    }, 60000);

    it('preserves confirmed denied targets and scoped business references without guessing missing targets', async () => {
      const app = await setup(dialect);
      try {
        await app.grant();
        for (const orderId of ['order-a', 'order-b']) {
          const path = '/orders/' + orderId + '/files';
          const upload = await app.upload(path);
          expect(upload.status).toBe(201);
          const { data } = (await upload.json()) as { data: { id: string } };
          expect(
            (await app.anonymous(path + '/' + data.id + '/content')).status,
          ).toBe(403);
          expect(
            (await app.request(path + '/' + data.id, { method: 'DELETE' }))
              .status,
          ).toBe(204);
          const events = await app.events();
          expect(events).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                action: 'file.content',
                outcome: 'denied',
                target: expect.objectContaining({ key: data.id }),
                details: { phase: 'request' },
              }),
              expect.objectContaining({
                action: 'file.upload-completed',
                source: { resource: 'orders', key: orderId },
              }),
              expect.objectContaining({
                action: 'file.delete-completed',
                source: { resource: 'orders', key: orderId },
              }),
            ]),
          );
        }
        expect(
          (await app.anonymous('/files/G16_GUESSED_FILE/content')).status,
        ).toBe(404);
        expect(JSON.stringify(await app.events())).not.toContain(
          'G16_GUESSED_FILE',
        );
      } finally {
        await app.close();
      }
    }, 60000);

    it('preserves committed uploads when the trusted source resolver or audit writer fails', async () => {
      const app = await setup(dialect);
      const report = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      try {
        await app.grant();
        expect((await app.upload('/broken-source')).status).toBe(201);
        const recorder = vi
          .spyOn(app.audit, 'record')
          .mockRejectedValueOnce(new Error(STORAGE_SECRET));
        expect((await app.upload()).status).toBe(201);
        recorder.mockRestore();
        const list = await app.request('/files');
        expect(((await list.json()) as { data: unknown[] }).data).toHaveLength(
          2,
        );
        expect(report).toHaveBeenCalledWith('File audit observation failed.', {
          code: 'FILE_AUDIT_WRITE_FAILED',
        });
        expect(JSON.stringify(report.mock.calls)).not.toContain(STORAGE_SECRET);
      } finally {
        report.mockRestore();
        await app.close();
      }
    }, 60000);

    it('keeps the original file behavior when the optional capability is absent', async () => {
      const app = await setup(dialect, false);
      try {
        await app.grant();
        expect((await app.upload()).status).toBe(201);
        expect(
          (await app.events()).some(
            (e) => e.action.startsWith('file.') && e.action !== 'file.probe',
          ),
        ).toBe(false);
      } finally {
        await app.close();
      }
    }, 60000);
  });
