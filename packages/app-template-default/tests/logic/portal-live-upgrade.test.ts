// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { serve } from '@hono/node-server';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

import { createSessionManager, type AppSessionConfig } from '@nocobase/session';
import { createApp, type ClosableApp } from '../../server/app.ts';

function createTestSession(sessionDir: string): AppSessionConfig {
  return {
    enabled: true,
    default: 'fs',
    stores: {
      fs: {
        driver: 'fs',
        base: sessionDir,
      },
    },
    cookie: {
      name: 'nocobase_session',
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    },
    lifetime: {
      absolute: '2h',
      rolling: true,
    },
    secret: 'test-portal-live-secret',
    gcLottery: [0, 100],
  };
}

interface UpgradeTestContext {
  app: ClosableApp;
  server: Server;
  port: number;
  cookie: string;
  dispose(): Promise<void>;
}

async function createUpgradeTestContext(): Promise<UpgradeTestContext> {
  const sessionDir = mkdtempSync(path.join(tmpdir(), 'portal-live-upgrade-'));
  const sessionConfig = createTestSession(sessionDir);
  const manager = createSessionManager(sessionConfig);
  const requestSession = manager.createRequestSession({});
  await requestSession.set('user', { id: 'user-1' });
  const persisted = await requestSession.persist();
  const cookie = persisted.cookieValue as string;
  expect(cookie).toBeTruthy();

  const app = createApp({
    appName: 'tests',
    session: sessionConfig,
    notifications: { enabled: true, allowNonPersistentStore: true },
  });
  const dispose = async (): Promise<void> => {
    await app.close();
    rmSync(sessionDir, { recursive: true, force: true });
  };

  let port = 0;
  const server = serve(
    {
      fetch: app.fetch,
      hostname: '127.0.0.1',
      port: 0,
      websocket: {
        server: app.websocketServer,
      },
    },
    (info) => {
      port = info.port;
    },
  );
  await waitFor(() => port > 0);

  return { app, server, port, cookie, dispose };
}

function waitFor(check: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const tick = (): void => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('Timed out waiting for condition.'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function waitForMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for a socket message.')), 5000);
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(data)) as Record<string, unknown>);
    });
  });
}

function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for socket close.')), 5000);
    socket.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: String(reason) });
    });
  });
}

async function openSocket(
  url: string,
  options: { headers?: Record<string, string> } = {},
): Promise<WebSocket> {
  const socket = new WebSocket(url, options);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  return socket;
}

describe('Portal Live WebSocket upgrade', () => {
  it('upgrades /live and authenticates via the session cookie', async () => {
    const context = await createUpgradeTestContext();
    try {
      const socket = await openSocket(`ws://127.0.0.1:${context.port}/live`, {
        headers: { cookie: `nocobase_session=${context.cookie}` },
      });
      const frame = await waitForMessage(socket);
      expect(frame).toEqual({ version: 1, type: 'auth_ok', streamId: 'tests:user-1' });
      socket.close();
    } finally {
      await context.dispose();
      context.server.close();
    }
  });

  it('rejects upgrades to other paths with a plain HTTP response', async () => {
    const context = await createUpgradeTestContext();
    try {
      await expect(
        openSocket(`ws://127.0.0.1:${context.port}/other`, {
          headers: { cookie: `nocobase_session=${context.cookie}` },
        }),
      ).rejects.toThrow(/Unexpected server response/);
    } finally {
      await context.dispose();
      context.server.close();
    }
  });

  it('authenticates with a bearer auth frame when no cookie is present', async () => {
    const context = await createUpgradeTestContext();
    try {
      const socket = await openSocket(`ws://127.0.0.1:${context.port}/live`);
      socket.send(
        JSON.stringify({
          version: 1,
          type: 'subscribe',
          subscriptionId: 's1',
          channel: 'notifications/inbox',
        }),
      );
      const denied = await waitForMessage(socket);
      expect(denied).toMatchObject({ type: 'error', code: 'AUTH_REQUIRED' });

      socket.send(JSON.stringify({ version: 1, type: 'auth', token: context.cookie }));
      const accepted = await waitForMessage(socket);
      expect(accepted).toEqual({ version: 1, type: 'auth_ok', streamId: 'tests:user-1' });
      socket.close();
    } finally {
      await context.dispose();
      context.server.close();
    }
  });

  it('drains active connections with server_draining and close 1001 on app close', async () => {
    const context = await createUpgradeTestContext();
    const socket = await openSocket(`ws://127.0.0.1:${context.port}/live`, {
      headers: { cookie: `nocobase_session=${context.cookie}` },
    });
    await waitForMessage(socket);
    const closePromise = waitForClose(socket);
    const drainingPromise = waitForMessage(socket);
    await context.app.close();
    const draining = await drainingPromise;
    const closed = await closePromise;
    expect(draining).toEqual({ version: 1, type: 'server_draining' });
    expect(closed.code).toBe(1001);
    context.server.close();
  });
});
