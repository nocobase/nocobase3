import { usernameClient } from 'better-auth/client/plugins';
import { describe, expect, it, vi } from 'vitest';
import { createAuthClient } from '../auth-client.js';

describe('native authentication client', () => {
  it('uses the configured public URL and username plugin', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ token: 'token', user: { id: '1' } }));
    const client = createAuthClient({
      baseURL: 'https://example.com/main/api/auth',
      plugins: [usernameClient({ displayUsername: false })],
      fetchOptions: { customFetchImpl: fetch },
    });
    await client.signIn.username({ username: 'alice', password: 'password' });
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://example.com/main/api/auth/sign-in/username',
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ username: 'alice', password: 'password' }),
    });
  });
  it('propagates native errors when requested', async () => {
    const client = createAuthClient({
      baseURL: 'https://example.com/api/auth',
      fetchOptions: {
        customFetchImpl: async () =>
          Response.json({ message: 'Invalid credentials' }, { status: 401 }),
      },
    });
    await expect(
      client.signIn.email(
        { email: 'alice@example.com', password: 'wrong' },
        { throw: true },
      ),
    ).rejects.toMatchObject({
      status: 401,
      error: { message: 'Invalid credentials' },
    });
  });
});
