import { defineConfig, type ConfigFactory } from '@nocobase/app-server/config';
import type { AuthOptions } from '@nocobase/authentication';

export type AppAuthConfig = Omit<AuthOptions, 'connection'>;

const authConfig: ConfigFactory<AppAuthConfig> = defineConfig(
  ({ env }): AppAuthConfig => {
    const secret = env.string('AUTH_SECRET');
    if (!secret) {
      throw new Error('AUTH_SECRET is required.');
    }

    const appName = env.string('AUTH_APP_NAME', 'NocoBase3');
    const cookiePath = env.string('AUTH_COOKIE_PATH', env.string('APP_BASE_PATH', '/'));
    return {
      appName,
      secret,
      emailAndPassword: {
        enabled: true,
      },
      advanced: {
        cookiePrefix: env.string('AUTH_COOKIE_PREFIX', createCookiePrefix(appName)),
        defaultCookieAttributes: {
          path: normalizeCookiePath(cookiePath),
        },
      },
    };
  },
);

export default authConfig;

function createCookiePrefix(appName: string): string {
  const normalized = appName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'nocobase3';
}

function normalizeCookiePath(path: string): string {
  const normalized = path.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/';
}
