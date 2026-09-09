// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createDatabaseManager, createMigrator } from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { genericOAuth, username } from 'better-auth/plugins';
import { createAuthEndpoint } from 'better-auth/api';
import { AuthManager } from '../../auth-manager.js';
import type { AuthOptions } from '../../auth-manager.js';

describe('authentication manager integration', () => {
  const database = createDatabaseManager({
    default: 'main',
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  const base = () => ({
    connection: database.connection(),
    secret: 'test-secret-at-least-32-characters',
    emailAndPassword: { enabled: true },
    plugins: [username({ displayUsername: false })],
    baseURL: 'http://localhost',
  });
  beforeAll(async () => {
    await createMigrator({
      database,
      packageName: '@nocobase/app-plugin-authentication',
      directory: fileURLToPath(
        new URL('../../../database/migrations', import.meta.url),
      ),
    }).latest();
    const auth = new AuthManager();
    auth.init(base());
    await auth.api.signUpEmail({
      body: {
        email: 'manager@example.com',
        name: 'Manager',
        username: 'manager',
        password: 'password-for-manager',
      },
    });
  });
  afterAll(async () => {
    await database.destroy();
  });

  it('exposes native plugin endpoints and the same native API', async () => {
    const auth = new AuthManager();
    auth.plugin({
      id: 'greeting',
      endpoints: {
        greeting: createAuthEndpoint(
          '/greeting',
          { method: 'GET' },
          async () => ({ greeting: 'hello' }),
        ),
      },
    });
    auth.init(base());
    expect(auth.api).toBe(auth.auth.api);
    const response = await auth.handler(
      new Request('http://localhost/api/auth/greeting'),
    );
    expect(await response.json()).toEqual({ greeting: 'hello' });
  });

  it('uses generic OAuth through the native social API and isolates App instances', async () => {
    const auth = new AuthManager();
    auth.plugin(
      genericOAuth({
        config: [
          {
            providerId: 'company',
            clientId: 'company-client',
            clientSecret: 'company-secret',
            authorizationUrl: 'https://identity.example/authorize',
            tokenUrl: 'https://identity.example/token',
            userInfoUrl: 'https://identity.example/userinfo',
          },
        ],
      }),
    );
    auth.init(base());
    const result = await auth.api.signInSocial({
      body: {
        provider: 'company',
        callbackURL: 'http://localhost/dashboard',
        disableRedirect: true,
      },
    });
    const url = new URL(result.url!);
    expect(url.origin).toBe('https://identity.example');
    expect(url.searchParams.get('client_id')).toBe('company-client');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost/api/auth/callback/company',
    );
    const other = new AuthManager();
    other.init(base());
    expect(other.auth).not.toBe(auth.auth);
    await expect(
      other.api.signInSocial({ body: { provider: 'company' } }),
    ).rejects.toThrow();
  });

  it('keeps username login when email/password is disabled', async () => {
    const auth = new AuthManager();
    const options: AuthOptions = {
      ...base(),
      emailAndPassword: { enabled: false },
    };
    auth.init(options);
    expect(
      await auth.api.signInUsername({
        body: { username: 'manager', password: 'password-for-manager' },
      }),
    ).toMatchObject({ user: { username: 'manager' } });
    await expect(
      auth.api.signInEmail({
        body: {
          email: 'manager@example.com',
          password: 'password-for-manager',
        },
      }),
    ).rejects.toMatchObject({ body: { code: 'EMAIL_PASSWORD_DISABLED' } });
    await expect(
      auth.api.signUpEmail({
        body: {
          email: 'new@example.com',
          name: 'New',
          password: 'password-for-manager',
        },
      }),
    ).rejects.toThrow();
  });

  it('disables username endpoints while keeping email login', async () => {
    const auth = new AuthManager();
    const options: AuthOptions = { ...base(), plugins: [] };
    auth.init(options);
    expect(
      await auth.api.signInEmail({
        body: {
          email: 'manager@example.com',
          password: 'password-for-manager',
        },
      }),
    ).toMatchObject({ user: { email: 'manager@example.com' } });
    const response = await auth.handler(
      new Request('http://localhost/api/auth/sign-in/username', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'manager',
          password: 'password-for-manager',
        }),
      }),
    );
    expect(response.status).toBe(404);
  });

  it('disables signup independently of both password login methods', async () => {
    const auth = new AuthManager();
    const options: AuthOptions = {
      ...base(),
      emailAndPassword: { enabled: true, disableSignUp: true },
    };
    auth.init(options);
    await expect(
      auth.api.signUpEmail({
        body: {
          email: 'blocked@example.com',
          name: 'Blocked',
          password: 'password-for-manager',
        },
      }),
    ).rejects.toThrow();
    expect(
      await auth.api.signInUsername({
        body: { username: 'manager', password: 'password-for-manager' },
      }),
    ).toHaveProperty('token');
    expect(
      await auth.api.signInEmail({
        body: {
          email: 'manager@example.com',
          password: 'password-for-manager',
        },
      }),
    ).toHaveProperty('token');
  });
});
