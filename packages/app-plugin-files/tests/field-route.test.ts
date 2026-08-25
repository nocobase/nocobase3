import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/app-database';
import type {
  CreateBusinessFileResponse,
  FileErrorResponse,
  PublicFileAccessResponse,
  StoredFile,
} from '@nocobase/app-plugin-files/protocol';
import {
  createFileService,
  resolveFilesConfig,
  type FileService,
  type FilesRuntime,
} from '@nocobase/app-plugin-files/server';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
import {
  createOpaqueFilesRuntime,
  getFilesRuntimeDataPlane,
  getFilesRuntimeKernel,
} from '../server/internal/runtime.js';

const EMPLOYEE_ONE = 'employee-1';
const EMPLOYEE_TWO = 'employee-2';

interface TestFixture {
  app: Hono;
  database: DatabaseManager;
  runtime: FilesRuntime;
  service: FileService;
  storageRoot: string;
  deniedActions: Set<'read' | 'write' | 'share'>;
  authorizeCalls: Array<{
    action: 'read' | 'write' | 'share';
    recordId: string;
    fileId?: string;
  }>;
}

const fixtures: TestFixture[] = [];

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map(async (fixture) => {
      await fixture.runtime.dispose();
      await fixture.database.destroy();
      await rm(fixture.storageRoot, { recursive: true, force: true });
    }),
  );
});

describe('field binding scoped file routes', () => {
  it('registers the exact unified route table without commit/access/uploads', async () => {
    const fixture = await createFixture({ publicAccess: true });
    const child = fixture.service.createFileRoute({
      binding: {
        type: 'field',
        collection: 'employees',
        recordParam: 'employeeId',
        fileField: 'avatarId',
      },
      publicAccess: true,
      authorize() {},
    });

    expect(
      child.routes.map(({ method, path: routePath }) => [method, routePath]),
    ).toEqual([
      ['GET', '/'],
      ['POST', '/'],
      ['PUT', '/:fileId/upload'],
      ['DELETE', '/:fileId/upload'],
      ['POST', '/:fileId/complete'],
      ['GET', '/:fileId/content'],
      ['HEAD', '/:fileId/content'],
      ['DELETE', '/:fileId'],
      ['POST', '/:fileId/public-access'],
      ['POST', '/:fileId/public-access/reset'],
      ['DELETE', '/:fileId/public-access'],
    ]);
    expect(
      child.routes.some(({ path: value }) => value.includes('commit')),
    ).toBe(false);
    expect(
      child.routes.some(
        ({ path: value }) =>
          value.includes('access') && !value.includes('public-access'),
      ),
    ).toBe(false);
    expect(
      child.routes.some(({ path: value }) => value.includes('uploads')),
    ).toBe(false);
  });

  it('runs POST, scoped Local PUT, scoped complete, and binds atomically', async () => {
    const fixture = await createFixture();
    const upload = await createUpload(fixture, EMPLOYEE_ONE, {
      name: 'avatar.txt',
      size: 6,
      contentType: 'text/plain',
    });

    expect(Object.keys(upload).sort()).toEqual(['file', 'plan']);
    expect(upload.plan.upload.url).toMatch(
      /^\/employees\/employee-1\/avatar\/.+\/upload\?access=/,
    );
    expect(upload.plan.complete.url).toMatch(
      /^\/employees\/employee-1\/avatar\/.+\/complete\?access=/,
    );
    expect(upload.plan.cancel.url).toMatch(
      /^\/employees\/employee-1\/avatar\/.+\/upload\?access=/,
    );

    const put = await putBytes(fixture, upload, 'avatar');
    expect(put.status).toBe(200);
    await expect(put.json()).resolves.toMatchObject({
      file: { id: upload.file.id, status: 'pending', size: null },
    });
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBeNull();

    const complete = await completeUpload(fixture, upload);
    expect(complete.status).toBe(200);
    await expect(complete.json()).resolves.toMatchObject({
      file: { id: upload.file.id, status: 'ready', size: 6 },
    });
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBe(upload.file.id);
    expect(await json<StoredFile[]>(await list(fixture, EMPLOYEE_ONE))).toEqual(
      [expect.objectContaining({ id: upload.file.id, status: 'ready' })],
    );

    const retry = await completeUpload(fixture, upload);
    expect(retry.status).toBe(200);
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBe(upload.file.id);
  });

  it('binds capabilities to scope, record, file, action, and expiry', async () => {
    const fixture = await createFixture();
    const first = await createUpload(fixture, EMPLOYEE_ONE, {
      name: 'first.txt',
      size: 1,
      contentType: 'text/plain',
    });
    const other = await createUpload(fixture, EMPLOYEE_TWO, {
      name: 'other.txt',
      size: 1,
      contentType: 'text/plain',
    });

    expect(
      (
        await fixture.app.request(
          replacePathRecord(first.plan.upload.url, EMPLOYEE_TWO),
          { method: 'PUT', body: 'x' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await fixture.app.request(
          first.plan.upload.url.replace(
            `/employees/${EMPLOYEE_ONE}/avatar/`,
            `/employee-files/${EMPLOYEE_ONE}/`,
          ),
          { method: 'PUT', body: 'x' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await fixture.app.request(
          replacePathFile(first.plan.upload.url, other.file.id),
          { method: 'PUT', body: 'x' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await fixture.app.request(first.plan.complete.url, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);
  });

  it('accepts an existing plan after rebuilding the runtime and route', async () => {
    const fixture = await createFixture();
    const upload = await createUpload(fixture, EMPLOYEE_ONE, {
      name: 'restart.txt',
      size: 7,
      contentType: 'text/plain',
    });
    await fixture.runtime.dispose();
    const rebuiltRuntime = createOpaqueFilesRuntime({
      database: fixture.database,
      config: resolveFilesConfig({
        appStorageRoot: fixture.storageRoot,
      }),
      audience: 'field-route-test',
      secret: 'field-route-test-secret-at-least-32-characters',
    });
    try {
      const rebuiltRoute = createFileService({
        runtime: rebuiltRuntime,
      }).createFileRoute({
        binding: {
          type: 'field',
          collection: 'employees',
          recordParam: 'employeeId',
          fileField: 'avatarId',
        },
        constraints: {
          maxBytes: 1024,
          allowedExtensions: ['.txt'],
          allowedContentTypes: ['text/plain'],
        },
        authorize() {},
      });
      const rebuiltApp = new Hono();
      rebuiltApp.route('/employees/:employeeId/avatar', rebuiltRoute);
      expect(
        (
          await rebuiltApp.request(upload.plan.upload.url, {
            method: 'PUT',
            headers: { 'content-length': '7', 'content-type': 'text/plain' },
            body: 'restart',
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await rebuiltApp.request(upload.plan.complete.url, {
            method: 'POST',
          })
        ).status,
      ).toBe(200);
      expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBe(upload.file.id);
    } finally {
      await rebuiltRuntime.dispose();
    }
  });

  it('isolates plans from routes with a different binding identity', async () => {
    const fixture = await createFixture();
    const upload = await createUpload(fixture, EMPLOYEE_ONE, {
      name: 'isolated.txt',
      size: 1,
      contentType: 'text/plain',
    });
    const isolatedRoute = fixture.service.createFileRoute({
      binding: {
        type: 'field',
        collection: 'employees',
        recordParam: 'workerId',
        fileField: 'avatarId',
      },
      authorize() {},
    });
    const isolatedApp = new Hono();
    isolatedApp.route('/employees/:workerId/avatar', isolatedRoute);
    expect(
      (
        await isolatedApp.request(upload.plan.upload.url, {
          method: 'PUT',
          body: 'x',
        })
      ).status,
    ).toBe(403);
  });

  it('keeps the old file when concurrent replacements conflict', async () => {
    const fixture = await createFixture();
    const original = await uploadAndComplete(fixture, EMPLOYEE_ONE, {
      name: 'old.txt',
      size: 3,
      contentType: 'text/plain',
    });
    const left = await createUpload(fixture, EMPLOYEE_ONE, {
      name: 'left.txt',
      size: 4,
      contentType: 'text/plain',
      replaceFileId: original.file.id,
    });
    const right = await createUpload(fixture, EMPLOYEE_ONE, {
      name: 'right.txt',
      size: 5,
      contentType: 'text/plain',
      replaceFileId: original.file.id,
    });
    await putBytes(fixture, left, 'left');
    await putBytes(fixture, right, 'right');

    const [leftResult, rightResult] = await Promise.all([
      completeUpload(fixture, left),
      completeUpload(fixture, right),
    ]);
    expect([leftResult.status, rightResult.status].sort()).toEqual([200, 409]);
    const conflict = leftResult.status === 409 ? leftResult : rightResult;
    expect(await json<FileErrorResponse>(conflict)).toMatchObject({
      code: 'FILE_BINDING_CONFLICT',
    });
    const winner = await currentAvatar(fixture, EMPLOYEE_ONE);
    expect([left.file.id, right.file.id]).toContain(winner);
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(
        leftResult.status === 409 ? left.file.id : right.file.id,
      ),
    ).toMatchObject({ status: 'ready' });
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(original.file.id),
    ).toMatchObject({ status: 'ready' });
  });

  it('cancels pending attempts without detaching a ready replacement target', async () => {
    const fixture = await createFixture();
    const original = await uploadAndComplete(fixture, EMPLOYEE_ONE, {
      name: 'old.txt',
      size: 3,
      contentType: 'text/plain',
    });
    const replacement = await createUpload(fixture, EMPLOYEE_ONE, {
      name: 'new.txt',
      size: 3,
      contentType: 'text/plain',
      replaceFileId: original.file.id,
    });
    await putBytes(fixture, replacement, 'new');

    const cancelled = await fixture.app.request(replacement.plan.cancel.url, {
      method: 'DELETE',
    });
    expect(cancelled.status).toBe(200);
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBe(original.file.id);
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(replacement.file.id),
    ).toMatchObject({ status: 'failed' });
  });

  it('checks read authorization and current binding for every GET/HEAD content', async () => {
    const fixture = await createFixture();
    const upload = await uploadAndComplete(fixture, EMPLOYEE_ONE, {
      name: 'private.txt',
      size: 7,
      contentType: 'text/plain',
    });
    const path = `/employees/${EMPLOYEE_ONE}/avatar/${upload.file.id}/content`;

    const head = await fixture.app.request(path, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get('content-length')).toBe('7');
    const content = await fixture.app.request(path);
    expect(content.status).toBe(200);
    await expect(content.text()).resolves.toBe('xxxxxxx');
    expect(fixture.authorizeCalls).toContainEqual({
      action: 'read',
      recordId: EMPLOYEE_ONE,
      fileId: upload.file.id,
    });

    fixture.deniedActions.add('read');
    expect((await fixture.app.request(path)).status).toBe(403);
    fixture.deniedActions.delete('read');
    expect(
      (
        await fixture.app.request(
          `/employees/${EMPLOYEE_TWO}/avatar/${upload.file.id}/content`,
        )
      ).status,
    ).toBe(404);
  });

  it('serves PDF content inline by default while allowing attachment override', async () => {
    const fixture = await createFixture();
    const upload = await uploadAndComplete(fixture, EMPLOYEE_ONE, {
      name: 'preview.pdf',
      size: 4,
      contentType: 'application/pdf',
    });
    const path = `/employees/${EMPLOYEE_ONE}/avatar/${upload.file.id}/content`;

    const inline = await fixture.app.request(path);
    expect(inline.status).toBe(200);
    expect(inline.headers.get('content-type')).toBe('application/pdf');
    expect(inline.headers.get('content-disposition')).toBe(
      `inline; filename="preview.pdf"; filename*=UTF-8''preview.pdf`,
    );
    await expect(inline.text()).resolves.toBe('xxxx');

    const attachment = await fixture.app.request(
      `${path}?disposition=attachment`,
      { method: 'HEAD' },
    );
    expect(attachment.status).toBe(200);
    expect(attachment.headers.get('content-disposition')).toBe(
      `attachment; filename="preview.pdf"; filename*=UTF-8''preview.pdf`,
    );
  });

  it('returns 404 for removed commit/access/uploads routes', async () => {
    const fixture = await createFixture();
    const fileId = 'a'.repeat(64);
    for (const [method, route] of [
      ['POST', `/employees/${EMPLOYEE_ONE}/avatar/${fileId}/commit`],
      ['POST', `/employees/${EMPLOYEE_ONE}/avatar/${fileId}/access`],
      ['POST', `/employees/${EMPLOYEE_ONE}/avatar/uploads`],
    ] as const) {
      expect((await fixture.app.request(route, { method })).status).toBe(404);
    }
  });

  it('enables, resets, and disables Public Access by fileId', async () => {
    const fixture = await createFixture({ publicAccess: true });
    const upload = await uploadAndComplete(fixture, EMPLOYEE_ONE, {
      name: 'public.txt',
      size: 6,
      contentType: 'text/plain',
    });
    const base = `/employees/${EMPLOYEE_ONE}/avatar/${upload.file.id}/public-access`;

    const enabled = await fixture.app.request(
      base,
      jsonRequest('POST', { disposition: 'inline' }),
    );
    expect(enabled.status).toBe(200);
    const first = await json<PublicFileAccessResponse>(enabled);
    expect(first.file.id).toBe(upload.file.id);
    expect((await fixture.app.request(first.access.url)).status).toBe(200);

    const reset = await fixture.app.request(
      `${base}/reset`,
      jsonRequest('POST', { disposition: 'attachment' }),
    );
    const second = await json<PublicFileAccessResponse>(reset);
    expect(second.access.token).not.toBe(first.access.token);
    expect((await fixture.app.request(first.access.url)).status).toBe(403);
    expect((await fixture.app.request(second.access.url)).status).toBe(200);

    expect((await fixture.app.request(base, { method: 'DELETE' })).status).toBe(
      200,
    );
    expect((await fixture.app.request(second.access.url)).status).toBe(403);
  });

  it('keeps configured Public Access routes and returns the stable global gate error', async () => {
    const fixture = await createFixture({ routePublicAccess: true });
    const upload = await uploadAndComplete(fixture, EMPLOYEE_ONE, {
      name: 'private-public.txt',
      size: 4,
      contentType: 'text/plain',
    });
    const response = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/${upload.file.id}/public-access`,
      { method: 'POST' },
    );
    expect(response.status).toBe(403);
    expect(await json<FileErrorResponse>(response)).toMatchObject({
      code: 'PUBLIC_ACCESS_DISABLED',
    });
  });

  it('detaches only ready bindings and preserves physical files', async () => {
    const fixture = await createFixture();
    const upload = await uploadAndComplete(fixture, EMPLOYEE_ONE, {
      name: 'detach.txt',
      size: 6,
      contentType: 'text/plain',
    });
    const response = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/${upload.file.id}`,
      { method: 'DELETE' },
    );
    expect(response.status).toBe(200);
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBeNull();
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(upload.file.id),
    ).toMatchObject({ status: 'ready' });
  });
});

interface CreateFixtureOptions {
  publicAccess?: boolean;
  routePublicAccess?: boolean;
  clock?: () => Date;
}

async function createFixture(
  options: CreateFixtureOptions = {},
): Promise<TestFixture> {
  const database = createDatabaseManager({
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
        pool: { min: 1, max: 1 },
      },
    },
  });
  await filesMigration.up(createMigrationContext(database.connection()));
  await database.builder().createCollection('employees', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('avatarId', { length: 64 }).nullable();
    collection.foreignKey('avatarId', {
      references: { collection: 'files', fields: ['id'] },
      onDelete: 'restrict',
    });
  });
  await database
    .query()
    .insertInto('employees')
    .values([
      { id: EMPLOYEE_ONE, avatarId: null },
      { id: EMPLOYEE_TWO, avatarId: null },
    ])
    .execute();

  const storageRoot = await mkdtemp(path.join(tmpdir(), 'files-field-route-'));
  const runtime = createOpaqueFilesRuntime(
    {
      database,
      config: resolveFilesConfig({
        appStorageRoot: storageRoot,
        config: { publicAccess: { enabled: options.publicAccess ?? false } },
      }),
      audience: 'field-route-test',
      secret: 'field-route-test-secret-at-least-32-characters',
    },
    options.clock === undefined ? {} : { clock: options.clock },
  );
  const service = createFileService({ runtime });
  const deniedActions = new Set<'read' | 'write' | 'share'>();
  const authorizeCalls: TestFixture['authorizeCalls'] = [];
  const route = service.createFileRoute({
    binding: {
      type: 'field',
      collection: 'employees',
      recordParam: 'employeeId',
      fileField: 'avatarId',
    },
    constraints: {
      maxBytes: 1024,
      allowedExtensions: ['.txt', '.pdf'],
      allowedContentTypes: ['text/plain', 'application/pdf'],
    },
    publicAccess: options.routePublicAccess ?? options.publicAccess,
    authorize({ action, recordId, fileId }) {
      authorizeCalls.push({
        action,
        recordId,
        ...(fileId === undefined ? {} : { fileId }),
      });
      if (deniedActions.has(action)) {
        throw new HTTPException(403, { message: 'Forbidden' });
      }
    },
  });
  const app = new Hono();
  app.route('/api/files', getFilesRuntimeDataPlane(runtime).createRoute());
  app.route('/employees/:employeeId/avatar', route);
  app.route('/employee-files/:employeeId', route);
  const fixture = {
    app,
    database,
    runtime,
    service,
    storageRoot,
    deniedActions,
    authorizeCalls,
  };
  fixtures.push(fixture);
  return fixture;
}

async function createUpload(
  fixture: TestFixture,
  employeeId: string,
  input: {
    name: string;
    size: number;
    contentType?: string;
    replaceFileId?: string;
  },
): Promise<CreateBusinessFileResponse> {
  const response = await fixture.app.request(
    `/employees/${employeeId}/avatar`,
    jsonRequest('POST', input),
  );
  expect(response.status).toBe(201);
  return json<CreateBusinessFileResponse>(response);
}

async function uploadAndComplete(
  fixture: TestFixture,
  employeeId: string,
  input: {
    name: string;
    size: number;
    contentType?: string;
    replaceFileId?: string;
  },
): Promise<CreateBusinessFileResponse> {
  const upload = await createUpload(fixture, employeeId, input);
  expect((await putBytes(fixture, upload, 'x'.repeat(input.size))).status).toBe(
    200,
  );
  expect((await completeUpload(fixture, upload)).status).toBe(200);
  return upload;
}

function putBytes(
  fixture: TestFixture,
  upload: CreateBusinessFileResponse,
  body: string,
): Promise<Response> {
  return Promise.resolve(
    fixture.app.request(upload.plan.upload.url, {
      method: 'PUT',
      headers: {
        ...upload.plan.upload.headers,
        'content-length': String(Buffer.byteLength(body)),
      },
      body,
    }),
  );
}

function completeUpload(
  fixture: TestFixture,
  upload: CreateBusinessFileResponse,
): Promise<Response> {
  return Promise.resolve(
    fixture.app.request(upload.plan.complete.url, { method: 'POST' }),
  );
}

function list(fixture: TestFixture, employeeId: string): Promise<Response> {
  return Promise.resolve(
    fixture.app.request(`/employees/${employeeId}/avatar`),
  );
}

async function currentAvatar(
  fixture: TestFixture,
  employeeId: string,
): Promise<string | null> {
  const row = await fixture.database
    .query()
    .selectFrom('employees')
    .select('avatarId')
    .where('id', '=', employeeId)
    .executeTakeFirst<Record<string, unknown>>();
  return typeof row?.avatarId === 'string' ? row.avatarId : null;
}

function replacePathRecord(url: string, recordId: string): string {
  return url.replace('/employees/employee-1/', `/employees/${recordId}/`);
}

function replacePathFile(url: string, fileId: string): string {
  return url.replace(/\/avatar\/[^/]+\//, `/avatar/${fileId}/`);
}

function jsonRequest(method: string, body: object): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
