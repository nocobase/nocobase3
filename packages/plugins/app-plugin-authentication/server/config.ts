import {
  ApplicationNotConfiguredError,
  assertSecretIsNotPlaceholder,
} from '@nocobase/app-server/config';

export type AuthConfig = import('better-auth').BetterAuthOptions;

/**
 * The secret sessions and tokens are signed with, or a refusal to start without one.
 *
 * An application that had no configuration at all used to be given a temporary secret here so that it could boot far
 * enough to serve an installation page. Nothing serves that page any more — configuration is written by
 * `nocobase app config init` before the application is started, and `pnpm dev` and `pnpm start` refuse to run without
 * it — so a missing secret is simply an error, and a far better one: a temporary secret is regenerated on every boot,
 * which silently invalidates every session on restart.
 */
export function resolveAuthSecret(secret: string | undefined): string {
  // Checked ahead of everything else, because the placeholder passes every test below: it is a non-empty string, so
  // it is taken as a configured secret, and it is the same string in every installation that copied
  // `config.example.yml` without editing it.
  assertSecretIsNotPlaceholder(secret, 'auth.secret');

  if (secret) return secret;

  throw new ApplicationNotConfiguredError(
    [
      'This application is not configured: auth.secret is not set.',
      '',
      'Create the configuration with:',
      '  pnpm config:init',
      '',
      'For a built application, run it inside dist/. If the application already has a configuration file, set',
      'auth.secret in it, or AUTH_SECRET in the environment.',
    ].join('\n'),
  );
}
