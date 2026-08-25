// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/database';
import type {
  CreateBusinessFileResponse,
  StoredFile,
} from '@nocobase/app-plugin-files/protocol';
import {
  createFileService,
  createFilesRuntime,
  resolveFilesConfig,
  type FilesRuntime,
} from '@nocobase/app-plugin-files/server';

import filesMigration from '../../../app-plugin-files/database/migrations/202608221000_files_create_files.ts';
import { appFileClient } from '../../registry/nocobase-file-upload/app-client.ts';
import { createPublicBasePathAdapter } from '../../server/runtime/app.ts';

interface Fixture {
  app: Hono;
  database: DatabaseManager;
  runtime: FilesRuntime;
  storageRoot: string;
}

const fixtures: Fixture[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(
    fixtures.splice(0).map(async (fixture) => {
      await fixture.runtime.dispose();
      await fixture.database.destroy();
      await rm(fixture.storageRoot, { recursive: true, force: true });
    }),
  );
});

describe('Files Local cross-layer workflow', () => {
  it('runs Registry through the App-local route, SQLite, Local storage, and detach', async () => {
    const fixture = await createFixture();
    vi.stubGlobal('window', {
      location: { origin: 'http://app.local' },
      NOCOBASE_PORTAL_BASE: '/main',
    });
    const requestedPaths: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(
        new URL(
          typeof input === 'string' ? input : input.url,
          'http://app.local',
        ),
        {
          ...init,
          headers: {
            ...(init?.credentials === 'include'
              ? { cookie: 'files-session=authenticated' }
              : {}),
            ...init?.headers,
          },
        },
      );
      requestedPaths.push(new URL(request.url).pathname);
      return fixture.app.fetch(request);
    });

    const basePath = 'documents/document-1/file';
    const created = await appFileClient.request<CreateBusinessFileResponse>(
      basePath,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'contract.txt',
          size: 8,
          contentType: 'text/plain',
        }),
      },
    );
    expect(requestedPaths[0]).toBe('/main/api/documents/document-1/file');
    expect(requestedPaths.some((value) => value.startsWith('/v2/api'))).toBe(
      false,
    );
    expect(created.plan.upload.url).toMatch(
      /^\/main\/api\/documents\/document-1\/file\/.+\/upload\?access=/,
    );
    expect(created.plan.complete.url).toMatch(
      /^\/main\/api\/documents\/document-1\/file\/.+\/complete\?access=/,
    );
    expect(created.plan.cancel.url).toMatch(
      /^\/main\/api\/documents\/document-1\/file\/.+\/upload\?access=/,
    );

    const upload = await fetch(created.plan.upload.url, {
      method: created.plan.upload.method,
      credentials: 'include',
      headers: {
        ...created.plan.upload.headers,
        'content-length': '8',
      },
      body: 'contract',
    });
    expect(upload.status).toBe(200);
    const complete = await fetch(created.plan.complete.url, {
      method: created.plan.complete.method,
      credentials: 'include',
    });
    expect(complete.status).toBe(200);

    const cancelled = await appFileClient.request<CreateBusinessFileResponse>(
      basePath,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'cancelled.txt',
          size: 1,
          contentType: 'text/plain',
          replaceFileId: created.file.id,
        }),
      },
    );
    const cancel = await fetch(cancelled.plan.cancel.url, {
      method: cancelled.plan.cancel.method,
      credentials: 'include',
    });
    expect(cancel.status).toBe(200);

    const listed = await appFileClient.request<StoredFile[]>(basePath);
    expect(listed).toEqual([
      expect.objectContaining({
        id: created.file.id,
        status: 'ready',
        size: 8,
      }),
    ]);

    const content = await fetch(
      `/main/api/${basePath}/${encodeURIComponent(created.file.id)}/content`,
      { credentials: 'include' },
    );
    expect(content.status).toBe(200);
    await expect(content.text()).resolves.toBe('contract');

    await appFileClient.request(
      `${basePath}/${encodeURIComponent(created.file.id)}`,
      { method: 'DELETE' },
    );
    await expect(
      appFileClient.request<StoredFile[]>(basePath),
    ).resolves.toEqual([]);
    await expect(
      fixture.database
        .query()
        .selectFrom('files')
        .select('status')
        .where('id', '=', created.file.id)
        .executeTakeFirst<Record<string, unknown>>(),
    ).resolves.toMatchObject({ status: 'ready' });
  });
});

async function createFixture(): Promise<Fixture> {
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
  await database.builder().createCollection('documents', (collection) => {
    collection.string('id', { length: 64 }).notNull().primary();
    collection.string('fileId', { length: 64 }).nullable();
    collection.foreignKey('fileId', {
      references: { collection: 'files', fields: ['id'] },
      onDelete: 'restrict',
    });
  });
  await database
    .query()
    .insertInto('documents')
    .values({ id: 'document-1', fileId: null })
    .execute();
  const storageRoot = await mkdtemp(path.join(tmpdir(), 'files-cross-layer-'));
  const runtime = createFilesRuntime({
    database,
    config: resolveFilesConfig({ appStorageRoot: storageRoot }),
    audience: 'files-cross-layer',
    secret: 'files-cross-layer-secret-at-least-32-characters',
  });
  const route = createFileService({
    runtime,
    publicBasePath: '/main',
  }).createFileRoute({
    binding: {
      type: 'field',
      collection: 'documents',
      recordParam: 'documentId',
      fileField: 'fileId',
    },
    constraints: {
      allowedExtensions: ['.txt'],
      allowedContentTypes: ['text/plain'],
    },
    authorize() {},
  });
  const internalApp = new Hono();
  internalApp.use('/api/documents/*', async (context, next) => {
    if (context.req.header('cookie') !== 'files-session=authenticated') {
      return context.json({ error: 'Unauthenticated' }, 401);
    }
    await next();
  });
  internalApp.route('/api/documents/:documentId/file', route);
  const app = createPublicBasePathAdapter(internalApp, '/main');
  const fixture = { app, database, runtime, storageRoot };
  fixtures.push(fixture);
  return fixture;
}
