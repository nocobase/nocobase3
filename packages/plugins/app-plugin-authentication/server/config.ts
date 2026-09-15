import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { assertSecretIsNotPlaceholder } from '@nocobase/app-server/config';

export type AuthConfig = import('better-auth').BetterAuthOptions;

const INSTALL_MODE_AUTH_SECRET = `nocobase-install-mode-${randomUUID()}-${randomUUID()}`;

export function resolveAuthSecret(
  secret: string | undefined,
  rootDir: string,
): string {
  // Checked ahead of everything else, because the placeholder passes every test below: it is a non-empty string, so
  // it is taken as a configured secret, and it is the same string in every installation that copied
  // `config.example.yml` without editing it.
  assertSecretIsNotPlaceholder(secret, 'auth.secret');

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
