// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { defineApiRoutes } from '@nocobase/app-server/router';
import { dialects } from '../../../../app-plugin-audit/tests/helpers/database-fixtures.js';
import { createAuditAuthApp, jsonRequest } from '../helpers/audit-app.js';

const password = 'AUTH_PASSWORD_SENTINEL_xxxxxxxxx';

describe.each(dialects)('authentication audit %s', (dialect) => {
  it('does not replay committed authentication when audit storage fails', async () => {
    const app = await createAuditAuthApp(dialect);
    const failure = vi
      .spyOn(app.fixture.store, 'appendWithLimits')
      .mockRejectedValue(new Error('AUTH_STORAGE_SECRET_SENTINEL'));
    const logs = vi.spyOn(console, 'error');
    try {
      const response = await app.request(
        '/auth/sign-up/email',
        jsonRequest({
          email: 'fault@example.com',
          name: 'Fault',
          username: 'fault',
          password,
        }),
      );
      expect(response.status).toBe(200);
      expect(failure).toHaveBeenCalledOnce();
      const cookie = response.headers.get('set-cookie')!;
      expect(await app.auth.getSession(new Headers({ cookie }))).not.toBeNull();
      expect(
        await app.fixture.connection.query
          .selectFrom('user')
          .select('id')
          .where('email', '=', 'fault@example.com')
          .execute(),
      ).toHaveLength(1);
      expect(JSON.stringify(logs.mock.calls)).not.toContain(
        'AUTH_STORAGE_SECRET_SENTINEL',
      );
    } finally {
      failure.mockRestore();
      logs.mockRestore();
      await app.close();
    }
  });
  it('preserves authentication when the optional bridge is absent', async () => {
    const app = await createAuditAuthApp(dialect, undefined, false);
    try {
      const signup = await app.request(
        '/auth/sign-up/email',
        jsonRequest({
          email: 'absent@example.com',
          name: 'Absent',
          username: 'absent',
          password,
        }),
      );
      expect(signup.status).toBe(200);
      const cookie = signup.headers.get('set-cookie')!;
      expect(await app.auth.getSession(new Headers({ cookie }))).not.toBeNull();
      expect(
        (await app.request('/auth/sign-out', jsonRequest({}, cookie))).status,
      ).toBe(200);
      expect(await app.auth.getSession(new Headers({ cookie }))).toBeNull();
      expect(await app.events()).toEqual([]);
    } finally {
      await app.close();
    }
  });
  it('records verified signup/login and pre-logout identity without secrets; revokes the actual session', async () => {
    const app = await createAuditAuthApp(dialect);
    const logs = vi.spyOn(console, 'error');
    try {
      const signup = await app.request(
        '/auth/sign-up/email',
        jsonRequest({
          email: 'auth@example.com',
          username: 'authuser',
          name: 'AUTH',
          password,
        }),
      );
      expect(signup.status).toBe(200);
      const registered = await signup.json();
      const userId = registered.user.id;
      expect(
        (await app.events()).find(
          (event) => event.action === 'authentication.sign-up',
        )?.actor,
      ).toEqual({ type: 'user', id: userId });
      for (const input of [
        { email: 'auth@example.com' },
        { username: 'authuser' },
      ]) {
        const path =
          'email' in input ? '/auth/sign-in/email' : '/auth/sign-in/username';
        const login = await app.request(
          path,
          jsonRequest({ ...input, password }),
        );
        expect(login.status).toBe(200);
        const cookie = login.headers.get('set-cookie')!;
        expect(
          await app.auth.getSession(new Headers({ cookie })),
        ).toMatchObject({ user: { id: userId } });
        const logout = await app.request(
          '/auth/sign-out',
          jsonRequest({}, cookie),
        );
        expect(logout.status).toBe(200);
        expect(await app.auth.getSession(new Headers({ cookie }))).toBeNull();
      }
      const denied = await app.request(
        '/auth/sign-in/email',
        jsonRequest({
          email: 'auth@example.com',
          password: 'AUTH_WRONG_PASSWORD_SENTINEL',
        }),
      );
      expect(denied.status).toBe(401);
      const events = await app.events();
      expect(events).toHaveLength(6);
      expect(
        events.filter((e) => e.action === 'authentication.sign-out'),
      ).toHaveLength(2);
      for (const event of events.filter((e) => e.outcome === 'success'))
        expect(event.actor).toEqual({ type: 'user', id: userId });
      expect(events.find((e) => e.outcome === 'denied')?.actor).toEqual({
        type: 'anonymous',
      });
      const serialized = JSON.stringify({
        events,
        logs: logs.mock.calls,
        error: await denied.text(),
      });
      for (const secret of [
        password,
        'AUTH_WRONG_PASSWORD_SENTINEL',
        'auth@example.com',
        'session_token',
      ])
        expect(serialized).not.toContain(secret);
    } finally {
      logs.mockRestore();
      await app.close();
    }
  });

  it('isolates concurrent identities, records early 401, and preserves disabled audit behavior', async () => {
    let executed = 0;
    const app = await createAuditAuthApp(dialect, (host, auth) => {
      host.addRoutes(
        defineApiRoutes(() => {
          const router = new Hono();
          router.post(
            '/protected',
            auth.auditHttp({ action: 'synthetic.write' }),
            auth.required(),
            (context) => {
              executed++;
              return context.json({ ok: true });
            },
          );
          return router;
        }),
      );
    });
    try {
      const users = await Promise.all(
        ['alpha', 'beta'].map(async (name) => {
          const response = await app.request(
            '/auth/sign-up/email',
            jsonRequest({
              email: `${name}@example.com`,
              username: name,
              name,
              password,
            }),
          );
          expect(response.status).toBe(200);
          return (await response.json()).user.id;
        }),
      );
      const signupEvents = (await app.events()).filter(
        (e) => e.action === 'authentication.sign-up',
      );
      expect(signupEvents.map((e) => e.actor.id).sort()).toEqual(users.sort());
      expect(new Set(signupEvents.map((e) => e.operationId)).size).toBe(2);
      expect((await app.request('/protected', jsonRequest({}))).status).toBe(
        401,
      );
      expect(executed).toBe(0);
      expect(
        (await app.events()).find((e) => e.action === 'synthetic.write'),
      ).toMatchObject({ outcome: 'denied', actor: { type: 'anonymous' } });
      const settings = await app.settings.get(app.fixture.scope);
      await app.settings.update(app.fixture.scope, {
        expectedRevision: settings.revision,
        settings: { ...settings, enabled: false },
        confirmRetentionReduction: false,
      });
      const before = (await app.events()).length;
      expect(
        (
          await app.request(
            '/auth/sign-in/email',
            jsonRequest({ email: 'alpha@example.com', password }),
          )
        ).status,
      ).toBe(200);
      expect((await app.events()).length).toBe(before);
    } finally {
      await app.close();
    }
  });
});
