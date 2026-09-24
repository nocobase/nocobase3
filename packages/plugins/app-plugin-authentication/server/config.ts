import {
  ApplicationNotConfiguredError,
  assertSecretIsNotPlaceholder,
  defineAppConfig,
  type AppConfigDefinition,
  type AppConfigFactory,
  type ConfigValidator,
} from '@nocobase/app-server/config';

export type AuthConfig = import('better-auth').BetterAuthOptions;

/**
 * The `auth` fields the browser may read, through `config.public`. `useSignUpAvailable()` on the client combines them;
 * keep the two in step.
 */
export const AUTH_PUBLIC_PATHS: readonly string[] = [
  'emailAndPassword.enabled',
  'emailAndPassword.disableSignUp',
];

const BOOLEAN_FIELDS = ['enabled', 'disableSignUp', 'autoSignIn'] as const;

/** The rules this plugin holds the `auth` section to, whichever application declares it. */
export const validateAuthConfig: ConfigValidator<AuthConfig> = (
  auth,
  context,
) => {
  const emailAndPassword: Record<string, unknown> =
    (auth.emailAndPassword as Record<string, unknown> | undefined) ?? {};
  for (const field of BOOLEAN_FIELDS) {
    const value = emailAndPassword[field];
    if (value !== undefined && typeof value !== 'boolean') {
      context.error(`emailAndPassword.${field}`, 'must be true or false.');
    }
  }
  if (
    emailAndPassword.enabled === false &&
    emailAndPassword.disableSignUp === false &&
    context.isUserProvided('emailAndPassword.disableSignUp')
  ) {
    context.warning(
      'emailAndPassword.disableSignUp',
      'has no effect while emailAndPassword.enabled is false.',
    );
  }
};

/**
 * Declares the `auth` section with this plugin's validation and public fields, in place of `defineAppConfig`.
 *
 * An application that keeps a plain `defineAppConfig` still starts, but its `auth` settings go unchecked and the
 * browser cannot tell whether sign-up is open, so the plugin warns about it at startup. A `validate` given here runs
 * after the plugin's own.
 */
export function defineAuthConfig(
  definition: AppConfigDefinition<AuthConfig>,
): AppConfigFactory<AuthConfig> {
  const extra =
    definition.validate === undefined
      ? []
      : Array.isArray(definition.validate)
        ? (definition.validate as readonly ConfigValidator<AuthConfig>[])
        : [definition.validate as ConfigValidator<AuthConfig>];
  return defineAppConfig<AuthConfig>({
    defaults: definition.defaults,
    validate: [validateAuthConfig, ...extra],
    public: [...new Set([...AUTH_PUBLIC_PATHS, ...(definition.public ?? [])])],
  });
}

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

  // The fact only: a standalone start adds `pnpm config:init`, and a Hub shows this to an operator whose
  // configuration lives in the Hub, where that advice would be wrong.
  throw new ApplicationNotConfiguredError('auth.secret is not set.', {
    key: 'auth.secret',
    environmentVariable: 'AUTH_SECRET',
  });
}
