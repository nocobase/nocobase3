import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  defineConfig,
  type ConfigFactory,
} from '@nocobase/app-server-kit/config';
import type { AuthOptions } from '@nocobase/app-plugin-authentication';

export type AppAuthConfig = Omit<
  AuthOptions,
  'basePath' | 'baseURL' | 'connection'
>;

const authConfig: ConfigFactory<AppAuthConfig> = defineConfig(
  ({ env, paths }): AppAuthConfig => {
    const secret = resolveAuthSecret(env.string('AUTH_SECRET'), paths.root());

    return {
      secret,
      emailAndPassword: {
        enabled: true,
        autoSignIn: false,
      },
      session: {
        storeSessionInDatabase: true,
      },
    };
  },
);

export default authConfig;

const INSTALL_MODE_AUTH_SECRET = `nocobase-install-mode-${randomUUID()}-${randomUUID()}`;

export function resolveAuthSecret(
  secret: string | undefined,
  rootDir: string,
): string {
  if (secret) {
    return secret;
  }

  const hasEnvironmentFile =
    existsSync(path.join(rootDir, '.env')) ||
    existsSync(path.join(rootDir, '.env.local'));
  if (!hasEnvironmentFile) {
    return INSTALL_MODE_AUTH_SECRET;
  }

  throw new Error('AUTH_SECRET is required.');
}
