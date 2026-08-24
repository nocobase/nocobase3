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
} from '@nocobase/database';
import type {
  CreateFileUploadResponse,
  FileAccessResponse,
  FileErrorResponse,
  FileReferenceResponse,
  ListFileReferencesResponse,
  PublicFileAccessResponse,
} from '@nocobase/app-plugin-files/protocol';
import {
  createFileService,
  resolveFilesConfig,
  type FileService,
  type FilesRuntime,
} from '@nocobase/app-plugin-files/server';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
import {
  getFilesRuntimeDataPlane,
  getFilesRuntimeKernel,
  createOpaqueFilesRuntime,
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
  }>;
  advance(milliseconds: number): void;
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

describe('field binding file routes', () => {
  it('explicitly mounts one complete child route using employeeId', async () => {
    const fixture = await createFixture();

    const empty = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar`,
    );
    expect(empty.status).toBe(200);
    expect(await json<ListFileReferencesResponse>(empty)).toEqual({
      references: [],
    });
    expect(fixture.authorizeCalls).toContainEqual({
      action: 'read',
      recordId: EMPLOYEE_ONE,
    });

    const upload = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'avatar.png',
      size: 6,
      contentType: 'image/png',
    });
    const commit = await commitUpload(fixture, EMPLOYEE_ONE, upload);
    expect(commit.status).toBe(200);
    const committed = await json<FileReferenceResponse>(commit);
    expect(committed.reference).toMatchObject({
      referenceId: upload.upload.plan.fileId,
      file: { status: 'ready', name: 'avatar.png', size: 6 },
    });
    const repeated = await commitUpload(fixture, EMPLOYEE_ONE, upload);
    expect(repeated.status).toBe(200);
    expect(await json<FileReferenceResponse>(repeated)).toEqual(committed);

    const listed = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar`,
    );
    expect(await json<ListFileReferencesResponse>(listed)).toEqual({
      references: [committed.reference],
    });
  });

  it('keeps the old ready avatar readable until replacement commit', async () => {
    const fixture = await createFixture();
    const first = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'old.png',
      size: 3,
      contentType: 'image/png',
    });
    await commitUpload(fixture, EMPLOYEE_ONE, first);

    const replacement = await createUpload(fixture, EMPLOYEE_ONE, {
      name: 'new.png',
      size: 4,
      contentType: 'image/png',
      replaceReferenceId: first.upload.plan.fileId,
    });
    const oldAccess = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/${first.upload.plan.fileId}/access`,
      { method: 'POST' },
    );
    expect(oldAccess.status).toBe(200);
    expect((await json<FileAccessResponse>(oldAccess)).access.url).toContain(
      `/api/files/${first.upload.plan.fileId}/content`,
    );

    const beforeCommit = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar`,
    );
    expect(
      (await json<ListFileReferencesResponse>(beforeCommit)).references[0]
        ?.referenceId,
    ).toBe(first.upload.plan.fileId);

    await uploadBytes(fixture, replacement, 'next');
    expect(
      (await commitUpload(fixture, EMPLOYEE_ONE, replacement)).status,
    ).toBe(200);
  });

  it('allows only one concurrent replacement for the same old snapshot', async () => {
    const fixture = await createFixture();
    const first = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'old.txt',
      size: 3,
      contentType: 'text/plain',
    });
    await commitUpload(fixture, EMPLOYEE_ONE, first);

    const [left, right] = await Promise.all([
      createReadyUpload(fixture, EMPLOYEE_ONE, {
        name: 'left.txt',
        size: 4,
        contentType: 'text/plain',
        replaceReferenceId: first.upload.plan.fileId,
      }),
      createReadyUpload(fixture, EMPLOYEE_ONE, {
        name: 'right.txt',
        size: 5,
        contentType: 'text/plain',
        replaceReferenceId: first.upload.plan.fileId,
      }),
    ]);
    const results = await Promise.all([
      commitUpload(fixture, EMPLOYEE_ONE, left),
      commitUpload(fixture, EMPLOYEE_ONE, right),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const conflict = results.find((response) => response.status === 409);
    expect(await json<FileErrorResponse>(required(conflict))).toMatchObject({
      code: 'FILE_BINDING_CONFLICT',
    });
    const listed = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar`,
    );
    expect([left.upload.plan.fileId, right.upload.plan.fileId]).toContain(
      (await json<ListFileReferencesResponse>(listed)).references[0]
        ?.referenceId,
    );
  });

  it('cancels pending attempts without clearing the old ready avatar', async () => {
    const fixture = await createFixture();
    const first = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'old.txt',
      size: 3,
      contentType: 'text/plain',
    });
    await commitUpload(fixture, EMPLOYEE_ONE, first);
    const replacement = await createUpload(fixture, EMPLOYEE_ONE, {
      name: 'cancel.txt',
      size: 5,
      contentType: 'text/plain',
      replaceReferenceId: first.upload.plan.fileId,
    });

    const cancelled = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/uploads/${replacement.upload.plan.fileId}`,
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bindingCredential: replacement.upload.bindingCredential,
        }),
      },
    );
    expect(cancelled.status).toBe(200);
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(
        replacement.upload.plan.fileId,
      ),
    ).toMatchObject({ status: 'failed' });
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBe(
      first.upload.plan.fileId,
    );
  });

  it('does not expose pending field values through the committed list', async () => {
    const fixture = await createFixture();
    const pending = await createUpload(fixture, EMPLOYEE_ONE, {
      name: 'pending.txt',
      size: 3,
      contentType: 'text/plain',
    });
    await fixture.database
      .query()
      .updateTable('employees')
      .set({ avatarId: pending.upload.plan.fileId })
      .where('id', '=', EMPLOYEE_ONE)
      .execute();

    const response = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar`,
    );
    expect(await json<ListFileReferencesResponse>(response)).toEqual({
      references: [],
    });
  });

  it('rejects route constraints before creating a pending file', async () => {
    const fixture = await createFixture();
    const response = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/uploads`,
      jsonRequest('POST', {
        name: 'blocked.exe',
        size: 3,
        contentType: 'application/octet-stream',
      }),
    );
    expect(response.status).toBe(415);
    expect(await json<FileErrorResponse>(response)).toMatchObject({
      code: 'UPLOAD_TYPE_NOT_ALLOWED',
    });
    expect(await fileCount(fixture)).toBe(0);
  });

  it('rejects unauthorized read, write, and share before side effects', async () => {
    const fixture = await createFixture({ publicAccess: true });
    fixture.deniedActions.add('write');
    const deniedUpload = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/uploads`,
      jsonRequest('POST', { name: 'denied.txt', size: 1 }),
    );
    expect(deniedUpload.status).toBe(403);
    expect(await fileCount(fixture)).toBe(0);

    fixture.deniedActions.delete('write');
    const upload = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'allowed.txt',
      size: 7,
      contentType: 'text/plain',
    });
    await commitUpload(fixture, EMPLOYEE_ONE, upload);

    fixture.deniedActions.add('read');
    const deniedRead = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/${upload.upload.plan.fileId}/access`,
      { method: 'POST' },
    );
    expect(deniedRead.status).toBe(403);

    fixture.deniedActions.add('share');
    const deniedShare = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/${upload.upload.plan.fileId}/public-access`,
      { method: 'POST' },
    );
    expect(deniedShare.status).toBe(403);
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getPublicAccessState(
        upload.upload.plan.fileId,
      ),
    ).toEqual({ tokenHash: null, disposition: null });
  });

  it('rejects cross-record credential reuse and arbitrary ready files', async () => {
    const fixture = await createFixture();
    const upload = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'one.txt',
      size: 3,
      contentType: 'text/plain',
    });
    const crossRecord = await commitUpload(fixture, EMPLOYEE_TWO, upload);
    expect(crossRecord.status).toBe(403);
    expect(await currentAvatar(fixture, EMPLOYEE_TWO)).toBeNull();

    const unrelated = await createReadyUpload(fixture, EMPLOYEE_TWO, {
      name: 'two.txt',
      size: 3,
      contentType: 'text/plain',
    });
    const arbitrary = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/uploads/${unrelated.upload.plan.fileId}/commit`,
      jsonRequest('POST', {
        bindingCredential: upload.upload.bindingCredential,
      }),
    );
    expect(arbitrary.status).toBe(403);
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBeNull();
  });

  it('rejects credential reuse on another route instance', async () => {
    const fixture = await createFixture();
    const secondRoute = fixture.service.createFileRoute({
      binding: {
        type: 'field',
        collection: 'employees',
        recordParam: 'employeeId',
        fileField: 'avatarId',
      },
      authorize() {},
    });
    fixture.app.route('/employee-files/:employeeId', secondRoute);
    const upload = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'route.txt',
      size: 3,
      contentType: 'text/plain',
    });

    const response = await fixture.app.request(
      `/employee-files/${EMPLOYEE_ONE}/uploads/${upload.upload.plan.fileId}/commit`,
      jsonRequest('POST', {
        bindingCredential: upload.upload.bindingCredential,
      }),
    );
    expect(response.status).toBe(403);
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBeNull();
  });

  it('rejects stale replacement snapshots before creating pending files', async () => {
    const fixture = await createFixture();
    const first = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'current.txt',
      size: 3,
      contentType: 'text/plain',
    });
    await commitUpload(fixture, EMPLOYEE_ONE, first);
    const before = await fileCount(fixture);

    const response = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/uploads`,
      jsonRequest('POST', {
        name: 'stale.txt',
        size: 3,
        contentType: 'text/plain',
        replaceReferenceId: 'a'.repeat(64),
      }),
    );
    expect(response.status).toBe(409);
    expect(await fileCount(fixture)).toBe(before);
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBe(
      first.upload.plan.fileId,
    );
  });

  it('rejects expired binding credentials before changing the field', async () => {
    const fixture = await createFixture();
    const upload = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'expired.txt',
      size: 3,
      contentType: 'text/plain',
    });
    fixture.advance(16 * 60 * 1000);

    const response = await commitUpload(fixture, EMPLOYEE_ONE, upload);
    expect(response.status).toBe(410);
    expect(await json<FileErrorResponse>(response)).toMatchObject({
      code: 'UPLOAD_EXPIRED',
    });
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBeNull();
  });

  it('does not detach or commit when write authorization fails', async () => {
    const fixture = await createFixture();
    const current = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'current.txt',
      size: 3,
      contentType: 'text/plain',
    });
    await commitUpload(fixture, EMPLOYEE_ONE, current);
    const replacement = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'replacement.txt',
      size: 4,
      contentType: 'text/plain',
      replaceReferenceId: current.upload.plan.fileId,
    });
    fixture.deniedActions.add('write');

    expect(
      (await commitUpload(fixture, EMPLOYEE_ONE, replacement)).status,
    ).toBe(403);
    expect(
      (
        await fixture.app.request(
          `/employees/${EMPLOYEE_ONE}/avatar/${current.upload.plan.fileId}`,
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(403);
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBe(
      current.upload.plan.fileId,
    );
  });

  it('detaches only the matching reference and retains the ready file', async () => {
    const fixture = await createFixture();
    const upload = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'detach.txt',
      size: 3,
      contentType: 'text/plain',
    });
    await commitUpload(fixture, EMPLOYEE_ONE, upload);

    const detached = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/${upload.upload.plan.fileId}`,
      { method: 'DELETE' },
    );
    expect(detached.status).toBe(200);
    expect(await currentAvatar(fixture, EMPLOYEE_ONE)).toBeNull();
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getFile(
        upload.upload.plan.fileId,
      ),
    ).toMatchObject({ status: 'ready' });
  });

  it('enables, resets, and disables public access when both gates allow it', async () => {
    const fixture = await createFixture({ publicAccess: true });
    const upload = await createReadyUpload(fixture, EMPLOYEE_ONE, {
      name: 'public.txt',
      size: 6,
      contentType: 'text/plain',
    });
    await commitUpload(fixture, EMPLOYEE_ONE, upload);
    const base = `/employees/${EMPLOYEE_ONE}/avatar/${upload.upload.plan.fileId}/public-access`;

    const enabled = await fixture.app.request(
      base,
      jsonRequest('POST', { disposition: 'inline' }),
    );
    expect(enabled.status).toBe(200);
    const firstAccess = await json<PublicFileAccessResponse>(enabled);
    expect(firstAccess.access).toMatchObject({ disposition: 'inline' });
    expect((await fixture.app.request(firstAccess.access.url)).status).toBe(
      200,
    );

    const reset = await fixture.app.request(
      `${base}/reset`,
      jsonRequest('POST', { disposition: 'attachment' }),
    );
    const secondAccess = await json<PublicFileAccessResponse>(reset);
    expect(secondAccess.access.token).not.toBe(firstAccess.access.token);
    expect((await fixture.app.request(firstAccess.access.url)).status).toBe(
      403,
    );
    expect((await fixture.app.request(secondAccess.access.url)).status).toBe(
      200,
    );

    const disabled = await fixture.app.request(base, { method: 'DELETE' });
    expect(disabled.status).toBe(200);
    expect((await fixture.app.request(secondAccess.access.url)).status).toBe(
      403,
    );
    expect(
      await getFilesRuntimeKernel(fixture.runtime).getPublicAccessState(
        upload.upload.plan.fileId,
      ),
    ).toEqual({ tokenHash: null, disposition: null });
  });

  it('omits public routes unless route and global configuration both enable them', async () => {
    const fixture = await createFixture({ routePublicAccess: true });
    const response = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar/missing/public-access`,
      { method: 'POST' },
    );
    expect(response.status).toBe(404);
    expect(fixture.authorizeCalls).not.toContainEqual({
      action: 'share',
      recordId: EMPLOYEE_ONE,
    });
  });

  it('fails clearly when the caller mount path omits the configured recordParam', async () => {
    const fixture = await createFixture({ mountParam: 'personId' });
    const response = await fixture.app.request(
      `/employees/${EMPLOYEE_ONE}/avatar`,
    );
    expect(response.status).toBe(500);
    expect(await json<FileErrorResponse>(response)).toMatchObject({
      code: 'FILE_ROUTE_INVALID',
      error: expect.stringContaining(':employeeId'),
    });
    expect(fixture.authorizeCalls).toHaveLength(0);
  });

  it('fails fast for invalid field metadata and constraints without secrets', async () => {
    const fixture = await createFixture({ mount: false });
    expect(() =>
      fixture.service.createFileRoute({
        binding: {
          type: 'field',
          collection: 'employees',
          recordParam: 'employeeId',
          fileField: 'displayName',
        },
        authorize() {},
      }),
    ).toThrow(/employees.*displayName.*nullable string\(64\)/i);
    expect(() =>
      fixture.service.createFileRoute({
        binding: {
          type: 'field',
          collection: 'missingCollection',
          recordParam: 'employeeId',
          fileField: 'avatarId',
        },
        authorize() {},
      }),
    ).toThrow(/missingCollection.*does not exist/i);
    expect(() =>
      fixture.service.createFileRoute({
        binding: {
          type: 'field',
          collection: 'employees',
          recordParam: 'employeeId',
          fileField: 'avatarId',
        },
        constraints: { maxBytes: 0 },
        authorize() {},
      }),
    ).toThrow(/maxBytes.*positive/i);
    expect(() =>
      fixture.service.createFileRoute({
        binding: {
          type: 'field',
          collection: 'employees',
          recordParam: 'employeeId',
          fileField: 'unconstrainedFileId',
        },
        authorize() {},
      }),
    ).toThrow(/unconstrainedFileId.*ON DELETE RESTRICT/i);
    expect(() =>
      fixture.service.createFileRoute({
        binding: {
          type: 'field',
          collection: 'employeesWithRequiredFile',
          recordParam: 'employeeId',
          fileField: 'requiredFileId',
        },
        authorize() {},
      }),
    ).toThrow(/requiredFileId.*nullable string\(64\)/i);
    expect(() =>
      fixture.service.createFileRoute({
        binding: {
          type: 'field',
          collection: 'employees',
          recordParam: '',
          fileField: 'avatarId',
        },
        authorize() {},
      }),
    ).toThrow(/recordParam.*invalid/i);
  });
});

interface CreateFixtureOptions {
  publicAccess?: boolean;
  routePublicAccess?: boolean;
  mountParam?: string;
  mount?: boolean;
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
      },
    },
  });
  await filesMigration.up(createMigrationContext(database.connection()));
  await database.builder().createCollection('employees', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('displayName', { length: 255 }).notNull();
    collection.string('avatarId', { length: 64 }).nullable();
    collection.string('unconstrainedFileId', { length: 64 }).nullable();
    collection.foreignKey('avatarId', {
      references: { collection: 'files', fields: ['id'] },
      onDelete: 'restrict',
    });
  });
  await database
    .builder()
    .createCollection('employeesWithRequiredFile', (collection) => {
      collection.string('id', { length: 64 }).notNull().primary();
      collection.string('requiredFileId', { length: 64 }).notNull();
      collection.foreignKey('requiredFileId', {
        references: { collection: 'files', fields: ['id'] },
        onDelete: 'restrict',
      });
    });
  await database
    .query()
    .insertInto('employees')
    .values([
      {
        id: EMPLOYEE_ONE,
        displayName: 'Employee One',
        avatarId: null,
        unconstrainedFileId: null,
      },
      {
        id: EMPLOYEE_TWO,
        displayName: 'Employee Two',
        avatarId: null,
        unconstrainedFileId: null,
      },
    ])
    .execute();
  const storageRoot = await mkdtemp(path.join(tmpdir(), 'files-field-route-'));
  let now = new Date('2026-08-24T00:00:00.000Z');
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
    {
      clock: () => now,
    },
  );
  const service = createFileService({ runtime });
  const deniedActions = new Set<'read' | 'write' | 'share'>();
  const authorizeCalls: TestFixture['authorizeCalls'] = [];
  const child = service.createFileRoute({
    binding: {
      type: 'field',
      collection: 'employees',
      recordParam: 'employeeId',
      fileField: 'avatarId',
    },
    constraints: {
      maxBytes: 1024,
      allowedExtensions: ['.png', '.txt'],
      allowedContentTypes: ['image/png', 'text/plain'],
    },
    publicAccess: options.routePublicAccess ?? options.publicAccess,
    authorize({ action, recordId }) {
      authorizeCalls.push({ action, recordId });
      if (deniedActions.has(action)) {
        throw new HTTPException(403, { message: 'Forbidden' });
      }
    },
  });
  const app = new Hono();
  app.route('/api/files', getFilesRuntimeDataPlane(runtime).createRoute());
  if (options.mount !== false) {
    app.route(
      `/employees/:${options.mountParam ?? 'employeeId'}/avatar`,
      child,
    );
  }
  const fixture: TestFixture = {
    app,
    database,
    runtime,
    service,
    storageRoot,
    deniedActions,
    authorizeCalls,
    advance(milliseconds) {
      now = new Date(now.getTime() + milliseconds);
    },
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
    replaceReferenceId?: string;
  },
): Promise<CreateFileUploadResponse> {
  const response = await fixture.app.request(
    `/employees/${employeeId}/avatar/uploads`,
    jsonRequest('POST', input),
  );
  expect(response.status).toBe(201);
  return json<CreateFileUploadResponse>(response);
}

async function createReadyUpload(
  fixture: TestFixture,
  employeeId: string,
  input: {
    name: string;
    size: number;
    contentType?: string;
    replaceReferenceId?: string;
  },
): Promise<CreateFileUploadResponse> {
  const upload = await createUpload(fixture, employeeId, input);
  await uploadBytes(fixture, upload, 'x'.repeat(input.size));
  return upload;
}

async function uploadBytes(
  fixture: TestFixture,
  upload: CreateFileUploadResponse,
  body: string,
): Promise<void> {
  const response = await fixture.app.request(upload.upload.plan.upload.url, {
    method: 'PUT',
    headers: {
      ...upload.upload.plan.upload.headers,
      'content-length': String(Buffer.byteLength(body)),
    },
    body,
  });
  expect(response.status).toBe(200);
}

async function commitUpload(
  fixture: TestFixture,
  employeeId: string,
  upload: CreateFileUploadResponse,
): Promise<Response> {
  return fixture.app.request(
    `/employees/${employeeId}/avatar/uploads/${upload.upload.plan.fileId}/commit`,
    jsonRequest('POST', {
      bindingCredential: upload.upload.bindingCredential,
    }),
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

async function fileCount(fixture: TestFixture): Promise<number> {
  return (
    await fixture.database.query().selectFrom('files').select('id').execute()
  ).length;
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

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Expected a value.');
  }
  return value;
}
