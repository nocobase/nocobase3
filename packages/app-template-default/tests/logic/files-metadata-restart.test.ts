// @vitest-environment node

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  createFileService,
  createFilesRuntime,
  resolveFilesConfig,
  type FileService,
  type FilesRuntime,
} from '@nocobase/app-plugin-files/server';
import {
  createAppRuntime,
  type AppRuntime,
} from '@nocobase/app-server-kit/runtime';
import type { AppDatabaseConfig } from '@nocobase/app-server-kit/database';

import type { AppConfig } from '../../server/config/index.js';
import { prepareAppRuntime } from '../../server/runtime/lifecycle.js';
const execFileAsync = promisify(execFile);

type RestartAppConfig = Pick<AppConfig, 'database' | 'plugins'>;

describe('Files Collection metadata restart', () => {
  it('restores skipped migration metadata before mounting field and relation routes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'files-metadata-restart-'));
    const filename = path.join(root, 'database.sqlite');
    let secondAppRuntime: AppRuntime<RestartAppConfig> | undefined;
    let secondFilesRuntime: FilesRuntime | undefined;

    try {
      await runMigrationsInSeparateProcess(filename);

      secondAppRuntime = createRestartAppRuntime(filename, false);
      const runMigrations = vi.spyOn(secondAppRuntime, 'runMigrations');
      expect(
        secondAppRuntime.database?.builder().inspectCollection('files'),
      ).toBeUndefined();
      expect(
        secondAppRuntime.database
          ?.builder()
          .inspectCollection('restartDocuments'),
      ).toBeUndefined();

      await prepareAppRuntime(secondAppRuntime);
      expect(runMigrations).not.toHaveBeenCalled();
      await requireDatabase(secondAppRuntime)
        .query()
        .insertInto('restartDocuments')
        .values({ id: 'document-1', fileId: null })
        .execute();
      expect(
        secondAppRuntime.database?.builder().inspectCollection('files'),
      ).toBeDefined();
      expect(
        secondAppRuntime.database
          ?.builder()
          .inspectCollection('restartDocuments'),
      ).toBeDefined();
      expect(
        secondAppRuntime.database
          ?.builder()
          .inspectCollection('restartDocumentFiles'),
      ).toBeDefined();

      secondFilesRuntime = createRestartFilesRuntime(secondAppRuntime, root);
      const fileService = createFileService({ runtime: secondFilesRuntime });
      const fieldRoute = createRestartDocumentsFileRoute(fileService);
      const relationRoute = createRestartDocumentFilesRoute(fileService);
      const app = new Hono();
      app.route('/documents/:documentId/file', fieldRoute);
      app.route('/documents/:documentId/files', relationRoute);

      const [fieldResponse, relationResponse] = await Promise.all([
        app.request('/documents/document-1/file'),
        app.request('/documents/document-1/files'),
      ]);
      expect(fieldResponse.status).toBe(200);
      expect(relationResponse.status).toBe(200);
      await expect(fieldResponse.json()).resolves.toEqual([]);
      await expect(relationResponse.json()).resolves.toEqual([]);
    } finally {
      await secondFilesRuntime?.dispose();
      await secondAppRuntime?.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function runMigrationsInSeparateProcess(filename: string): Promise<void> {
  const tsx = fileURLToPath(
    new URL('../../node_modules/.bin/tsx', import.meta.url),
  );
  const fixture = fileURLToPath(
    new URL('../fixtures/files-metadata-restart/migrate.ts', import.meta.url),
  );
  await execFileAsync(tsx, [fixture, filename]);
}

function createRestartAppRuntime(
  filename: string,
  autoRun: boolean,
): AppRuntime<RestartAppConfig> {
  const database: AppDatabaseConfig = {
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename,
        pool: { min: 1, max: 1 },
      },
    },
    migrations: {
      directory: fileURLToPath(
        new URL('../../database/migrations', import.meta.url),
      ),
      autoRun,
      sources: [
        {
          packageName: '@nocobase/app-plugin-files',
          directory: fileURLToPath(
            new URL(
              '../../../app-plugin-files/database/migrations',
              import.meta.url,
            ),
          ),
        },
        {
          packageName: '@nocobase/files-metadata-restart-test',
          directory: fileURLToPath(
            new URL(
              '../fixtures/files-metadata-restart/database/migrations',
              import.meta.url,
            ),
          ),
        },
      ],
    },
  };

  return createAppRuntime({
    database,
    plugins: [
      {
        packageName: '@nocobase/app-plugin-files',
        version: '0.0.1',
        enabled: true,
        rootDir: '',
        manifest: {},
      },
    ],
  });
}

function createRestartFilesRuntime(
  runtime: AppRuntime<RestartAppConfig>,
  root: string,
): FilesRuntime {
  return createFilesRuntime({
    database: requireDatabase(runtime),
    config: resolveFilesConfig({ appStorageRoot: path.join(root, 'storage') }),
    audience: 'files-metadata-restart-test',
    secret: 'files-metadata-restart-secret-at-least-32-characters',
  });
}

function requireDatabase(
  runtime: AppRuntime<RestartAppConfig>,
): NonNullable<AppRuntime<RestartAppConfig>['database']> {
  if (!runtime.database) {
    throw new Error('Expected the restart test database to be configured.');
  }
  return runtime.database;
}

function createRestartDocumentsFileRoute(fileService: FileService): Hono {
  return fileService.createFileRoute({
    binding: {
      type: 'field',
      collection: 'restartDocuments',
      recordParam: 'documentId',
      fileField: 'fileId',
    },
    authorize() {},
  });
}

function createRestartDocumentFilesRoute(fileService: FileService): Hono {
  return fileService.createFileRoute({
    binding: {
      type: 'relation',
      collection: 'restartDocumentFiles',
      recordParam: 'documentId',
      recordField: 'restartDocumentId',
      maxFiles: 2,
    },
    authorize() {},
  });
}
