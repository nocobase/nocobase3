import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  defineAppConfig,
  envString,
  type AppConfigDefinition,
} from '@nocobase/app-server-kit/config';
import { Type } from '@sinclair/typebox';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server-kit/runtime';

import type { CreateAuthenticationOptions } from './auth.js';

export type AuthenticationConfig = Omit<
  CreateAuthenticationOptions,
  'basePath' | 'baseURL' | 'connection'
>;

export const authenticationConfig: AppConfigDefinition<
  AuthenticationConfig,
  ResolvedAppRuntimeConfigContext
> = defineAppConfig({
  namespace: 'auth',
  schema: Type.Object(
    {
      secret: Type.Optional(
        Type.String({
          minLength: 32,
          description: 'Secret used to sign authentication tokens and cookies.',
        }),
      ),
      emailAndPassword: Type.Object(
        {
          enabled: Type.Boolean({ default: true }),
          autoSignIn: Type.Boolean({ default: false }),
        },
        { additionalProperties: false },
      ),
      session: Type.Object(
        {
          storeSessionInDatabase: Type.Boolean({ default: true }),
        },
        { additionalProperties: false },
      ),
      trustedOrigins: Type.Optional(Type.Array(Type.String())),
    },
    // Better Auth exposes a broad, extensible option surface. Keep the core
    // fields structured while allowing options whose schemas live upstream.
    { additionalProperties: true },
  ),
  defaults: {
    emailAndPassword: { enabled: true, autoSignIn: false },
    session: { storeSessionInDatabase: true },
  },
  envMappings: { AUTH_SECRET: envString('secret') },
});

const INSTALL_MODE_AUTH_SECRET = `nocobase-install-mode-${randomUUID()}-${randomUUID()}`;

export function resolveAuthSecret(
  secret: string | undefined,
  rootDir: string,
): string {
  if (secret) return secret;
  if (
    !existsSync(path.join(rootDir, 'config.yml')) &&
    !existsSync(path.join(rootDir, 'config.yaml')) &&
    !existsSync(path.join(rootDir, 'config.json'))
  ) {
    return INSTALL_MODE_AUTH_SECRET;
  }
  throw new Error('auth.secret is required.');
}
