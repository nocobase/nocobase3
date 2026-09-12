import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';

export type AuthConfig = import('better-auth').BetterAuthOptions;

const INSTALL_MODE_AUTH_SECRET = `nocobase-install-mode-${randomUUID()}-${randomUUID()}`;

export function resolveAuthSecret(
  secret: string | undefined,
  rootDir: string,
): string {
  if (secret) return secret;
  if (
    !existsSync(path.join(rootDir, 'config.toml')) &&
    !existsSync(path.join(rootDir, 'config.yml')) &&
    !existsSync(path.join(rootDir, 'config.yaml')) &&
    !existsSync(path.join(rootDir, 'config.json'))
  ) {
    return INSTALL_MODE_AUTH_SECRET;
  }
  throw new Error('auth.secret is required.');
}
