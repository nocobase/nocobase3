import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { INSTALL_MODE_AUTH_SECRET_PREFIX } from '../server/install-mode.js';
import { createInstallRoutes } from '../server/routes/index.js';
import registerInstallRoutes from '../server/routes/index.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('@nocobase/app-plugin-install routes', () => {
  it('only registers the status route after installation', async () => {
    const app = new Hono();
    registerInstallRoutes({
      app,
      config: createPluginConfig('configured-secret'),
      deps: undefined,
      services: undefined,
      paths: createConfigPaths({ rootDir: '/missing' }),
    });
    app.get('*', (context) => context.text('application'));

    const loginResponse = await app.request('/login', {
      headers: { Accept: 'text/html' },
    });
    const installResponse = await app.request('/install', {
      headers: { Accept: 'text/html' },
    });
    const statusResponse = await app.request('/install/status');

    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.text()).resolves.toBe('application');
    expect(installResponse.status).toBe(200);
    await expect(installResponse.text()).resolves.toBe('application');
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.headers.get('Cache-Control')).toBe('no-store');
    await expect(statusResponse.json()).resolves.toEqual({ installed: true });
  });

  it('registers the redirect middleware and install routes in install mode', async () => {
    const app = new Hono();
    registerInstallRoutes({
      app,
      config: createPluginConfig(
        `${INSTALL_MODE_AUTH_SECRET_PREFIX}temporary-secret`,
      ),
      deps: undefined,
      services: undefined,
      paths: createConfigPaths({ rootDir: '/missing' }),
    });
    app.get('*', (context) => context.text('application'));

    const pageResponse = await app.request('/login', {
      headers: { Accept: 'text/html' },
    });
    const installResponse = await app.request('/install', {
      headers: { Accept: 'text/html' },
    });
    const apiResponse = await app.request('/api/health');
    const statusResponse = await app.request('/install/status');

    expect(pageResponse.status).toBe(302);
    expect(pageResponse.headers.get('Location')).toBe('/install');
    expect(installResponse.status).toBe(200);
    await expect(installResponse.text()).resolves.toBe('application');
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toEqual({ installed: false });
    expect(apiResponse.status).toBe(200);
    await expect(apiResponse.text()).resolves.toBe('application');
  });

  it('configures an application without returning its secret', async () => {
    const rootDir = createTemporaryRoot();
    writeFileSync(
      path.join(rootDir, '.env.example'),
      'APP_BASE_PATH=/main\nDB_MIGRATIONS_AUTO_RUN=true\n',
    );
    const app = new Hono();
    app.route(
      '/install',
      createInstallRoutes({
        paths: createConfigPaths({ rootDir }),
        generateSecret: () => 'private-secret',
      }),
    );

    const response = await app.request('/install/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialect: 'sqlite', database: 'database.sqlite' }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      configured: true,
      restartRequired: true,
    });
    expect(body).not.toContain('private-secret');

    const repeatedResponse = await app.request('/install/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialect: 'sqlite', database: 'other.sqlite' }),
    });
    expect(repeatedResponse.status).toBe(409);
  });

  it('rejects malformed configuration requests', async () => {
    const rootDir = createTemporaryRoot();
    writeFileSync(path.join(rootDir, '.env.example'), 'APP_BASE_PATH=/main\n');
    const app = new Hono();
    app.route(
      '/install',
      createInstallRoutes({
        paths: createConfigPaths({ rootDir }),
      }),
    );

    const malformedResponse = await app.request('/install/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(malformedResponse.status).toBe(400);
    await expect(malformedResponse.json()).resolves.toEqual({
      message: 'The request body must contain valid JSON.',
    });

    const invalidResponse = await app.request('/install/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialect: 'sqlite', database: '' }),
    });
    expect(invalidResponse.status).toBe(400);
  });
});

function createTemporaryRoot(): string {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'nocobase-app-plugin-install-routes-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function createPluginConfig(secret: string): {
  auth: { secret: string };
} {
  return {
    auth: { secret },
  };
}
