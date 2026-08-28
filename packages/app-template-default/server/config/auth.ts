import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from '@nocobase/app-server-kit/config';
import type { AppRuntimeConfigFactory } from '@nocobase/app-server-kit/runtime';
import type { AuthOptions } from '@nocobase/app-plugin-authentication';
import type {
  AppConfig,
  DefaultAppConfigContext,
  DefaultAppScopeConfig,
} from './types.js';

export type AppAuthConfig = Omit<
  AuthOptions,
  'basePath' | 'baseURL' | 'connection'
>;

const authConfig: AppRuntimeConfigFactory<
  AppAuthConfig,
  AppConfig,
  DefaultAppScopeConfig
> = defineConfig<AppAuthConfig, DefaultAppConfigContext>(
  ({ env, paths, scopeConfig }): AppAuthConfig => {
    const secret = resolveAuthSecret(
      scopeConfig?.authSecret ?? env.string('AUTH_SECRET'),
      paths.root(),
    );

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
