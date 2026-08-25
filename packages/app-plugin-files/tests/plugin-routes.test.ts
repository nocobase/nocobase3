import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  type DatabaseManager,
} from '@nocobase/app-database';

import { resolveFilesConfig } from '../server/config.js';
import { createFilesRuntime, type FilesRuntime } from '../server/runtime.js';
import registerFilesRoutes from '../server/routes/index.js';

let database: DatabaseManager | undefined;
let runtime: FilesRuntime | undefined;
let storageRoot: string | undefined;

afterEach(async () => {
  await runtime?.dispose();
  await database?.destroy();
  if (storageRoot) {
    await rm(storageRoot, { recursive: true, force: true });
  }
  runtime = undefined;
  database = undefined;
  storageRoot = undefined;
});

describe('Files plugin routes', () => {
  it('mounts the data plane at /api/files after existing API routes', async () => {
    database = createDatabaseManager({
      default: 'sqlite',
      connections: {
        sqlite: {
          dialect: 'sqlite',
          driver: 'better-sqlite3',
          filename: ':memory:',
        },
      },
    });
    storageRoot = await mkdtemp(path.join(tmpdir(), 'files-plugin-routes-'));
    runtime = createFilesRuntime({
      database,
      config: resolveFilesConfig({ appStorageRoot: storageRoot }),
      audience: 'plugin-route-test',
      secret: 'plugin-route-secret-at-least-32-characters',
      basePath: '/tenant/api/files',
    });
    const app = new Hono();
    const api = new Hono();
    api.use('*', async (context, next) => {
      await next();
      context.header('x-api-middleware', 'applied');
    });
    app.route('/api', api);

    registerFilesRoutes({
      app,
      deps: { filesRuntime: runtime },
      services: {},
    });

    const apiResponse = await app.request(
      '/api/files/missing/content?access=secret',
    );
    const rootResponse = await app.request(
      '/files/missing/content?access=secret',
    );

    expect(apiResponse.status).toBe(403);
    expect(apiResponse.headers.get('x-api-middleware')).toBe('applied');
    await expect(apiResponse.json()).resolves.toEqual({
      error: 'The file access credential is invalid.',
      code: 'INVALID_ACCESS',
    });
    expect(rootResponse.status).toBe(404);
  });

  it('rejects registration without the app-owned runtime', () => {
    expect(() =>
      registerFilesRoutes({
        app: new Hono(),
        deps: {},
        services: {},
      }),
    ).toThrow('The Files plugin runtime is not initialized.');
  });
});
