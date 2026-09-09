// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseConnection } from '@nocobase/db';
import { AuthManager, type AuthOptions } from '../../auth-manager.js';
const betterAuth = vi.hoisted(() => vi.fn());
vi.mock('better-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('better-auth')>()),
  betterAuth,
}));
const base: AuthOptions = {
  connection: {} as DatabaseConnection,
  secret: 'test-secret-at-least-32-characters',
};
beforeEach(() => {
  betterAuth.mockReset();
});
describe('AuthManager', () => {
  it('passes collected plugins and shallowly merged options to Better Auth', () => {
    const api = {};
    betterAuth.mockReturnValue({ $context: Promise.resolve({}), api });
    const auth = new AuthManager();
    const hook = vi.fn();
    auth.plugin({ id: 'test' });
    auth.mergeOptions({ session: { expiresIn: 100, updateAge: 10 } });
    auth.mergeOptions({
      session: { expiresIn: 200 },
      emailAndPassword: { enabled: true, onExistingUserSignUp: hook },
    });
    auth.socialProviders({ github: { clientId: 'old', clientSecret: 'old' } });
    auth.socialProviders({ github: { clientId: 'new' } });
    expect(betterAuth).not.toHaveBeenCalled();
    auth.init(base);
    expect(betterAuth).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        session: { expiresIn: 200 },
        plugins: [{ id: 'test' }],
        emailAndPassword: { enabled: true, onExistingUserSignUp: hook },
        socialProviders: { github: { clientId: 'new' } },
      }),
    );
    expect(auth.api).toBe(api);
  });
  it('returns the native instance synchronously', () => {
    const instance = { api: {} };
    betterAuth.mockReturnValue(instance);
    const auth = new AuthManager();
    expect(auth.init(base)).toBeUndefined();
    expect(auth.auth).toBe(instance);
  });
});
