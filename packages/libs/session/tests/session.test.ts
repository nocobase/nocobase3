import { setTimeout as sleep } from 'node:timers/promises';

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  assertDefaultSessionStore,
  createSessionManager,
  createSessionMiddleware,
  parseSessionDuration,
  type AppSessionConfig,
  type SessionData,
  type SessionEnv,
} from '../src/index.js';

type TestSessionData = SessionData & {
  userId?: number;
  count?: number;
};

describe('createSessionManager', () => {
  it('persists session data across Hono requests', async () => {
    const router = createTestRouter();

    const login = await router.request('http://localhost/login');
    const cookie = firstCookie(login);
    expect(cookie).toContain('nocobase_session=');

    const me = await router.request('http://localhost/me', {
      headers: {
        cookie,
      },
    });

    await expect(me.json()).resolves.toEqual({
      userId: 1,
      count: 1,
    });
  });

  it('updates and destroys an existing session', async () => {
    const router = createTestRouter();
    const login = await router.request('http://localhost/login');
    const cookie = firstCookie(login);

    const bump = await router.request('http://localhost/bump', {
      headers: {
        cookie,
      },
    });
    const updatedCookie = firstCookie(bump);

    const me = await router.request('http://localhost/me', {
      headers: {
        cookie: updatedCookie,
      },
    });
    await expect(me.json()).resolves.toEqual({
      userId: 1,
      count: 2,
    });

    const logout = await router.request('http://localhost/logout', {
      headers: {
        cookie: updatedCookie,
      },
    });

    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');

    const afterLogout = await router.request('http://localhost/me', {
      headers: {
        cookie: updatedCookie,
      },
    });
    await expect(afterLogout.json()).resolves.toBeNull();
  });

  it('sweeps expired stored sessions', async () => {
    const manager = createSessionManager<TestSessionData>(createConfig());
    const now = Date.now();

    await manager.store.set('expired', {
      data: {
        userId: 1,
      },
      createdAt: now - 2000,
      updatedAt: now - 2000,
      expiresAt: now - 1000,
    });
    await manager.store.set('active', {
      data: {
        userId: 2,
      },
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 1000,
    });

    await expect(manager.sweepExpiredSessions(now)).resolves.toBe(1);
    await expect(manager.store.get('expired')).resolves.toBeNull();
    await expect(manager.store.get('active')).resolves.toEqual({
      data: {
        userId: 2,
      },
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 1000,
    });

    await manager.dispose();
  });

  it('throws when the default store is missing', () => {
    expect(() =>
      assertDefaultSessionStore({
        ...createConfig(),
        default: 'missing',
      }),
    ).toThrow('Default session store "missing" is not configured.');
  });

  it('parses session durations', () => {
    expect(parseSessionDuration('2h', 'Test')).toBe(2 * 60 * 60 * 1000);
    expect(parseSessionDuration('30 minutes', 'Test')).toBe(30 * 60 * 1000);
    expect(parseSessionDuration(5000, 'Test')).toBe(5000);
    expect(() => parseSessionDuration('soon', 'Test')).toThrow(
      'Test session duration "soon" is invalid.',
    );
  });

  it('expires idle sessions on read', async () => {
    const router = createTestRouter({
      lifetime: {
        absolute: '1h',
        inactivity: '20ms',
        rolling: true,
      },
    });

    const login = await router.request('http://localhost/login');
    const cookie = firstCookie(login);
    await sleep(40);

    const me = await router.request('http://localhost/me', {
      headers: {
        cookie,
      },
    });

    await expect(me.json()).resolves.toBeNull();
    expect(me.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

function createTestRouter(
  config: Partial<AppSessionConfig> = {},
): Hono<SessionEnv<TestSessionData>> {
  const manager = createSessionManager<TestSessionData>({
    ...createConfig(),
    ...config,
  });
  const router = new Hono<SessionEnv<TestSessionData>>();

  router.use('*', createSessionMiddleware(manager));

  router.get('/login', async (context) => {
    await context.var.session.update({
      userId: 1,
      count: 1,
    });

    return context.json({
      ok: true,
      id: context.var.session.id,
    });
  });

  router.get('/bump', async (context) => {
    await context.var.session.update((previous) => ({
      userId: previous?.userId,
      count: Number(previous?.count ?? 0) + 1,
    }));

    return context.json(await context.var.session.get());
  });

  router.get('/me', async (context) => {
    return context.json(await context.var.session.get());
  });

  router.get('/logout', async (context) => {
    await context.var.session.destroy();
    return context.json({
      ok: true,
    });
  });

  return router;
}

function createConfig(): AppSessionConfig {
  return {
    enabled: true,
    default: 'memory',
    stores: {
      memory: {
        driver: 'memory',
        base: 'tests:session:',
      },
      null: {
        driver: 'null',
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
    secret: 'test-session-secret',
    gcLottery: [0, 100],
  };
}

function firstCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  return setCookie?.split(';')[0] ?? '';
}
