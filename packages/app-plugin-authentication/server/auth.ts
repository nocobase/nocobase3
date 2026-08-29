import type { DatabaseConnection } from '@nocobase/app-database';
import {
  APIError,
  betterAuth,
  type BetterAuthOptions,
  type Session,
  type User,
} from 'better-auth';
import { username } from 'better-auth/plugins';
import type { Context, MiddlewareHandler } from 'hono';
import { databaseAdapter } from './better-auth/database-adapter.js';

export interface AuthOptions extends Omit<BetterAuthOptions, 'database'> {
  connection: DatabaseConnection;
}

export interface CreateAuthenticationOptions extends Omit<
  AuthOptions,
  'connection'
> {
  connection?: DatabaseConnection;
}

export type AuthSession = { user: User; session: Session } | null;

export interface AuthEnv {
  Variables: { auth: AuthSession };
}

export interface AuthMiddlewareOptions {
  skip?: (context: Context) => boolean;
}

export interface CreatePasswordUserInput {
  email: string;
  password: string;
  name: string;
  username?: string;
}

export interface CreatePasswordUserOptions {
  /**
   * The caller-owned connection used for every user and account write. Pass a
   * transaction connection when provisioning must commit with other domain
   * records.
   */
  connection: DatabaseConnection;
}

export type PasswordUser = User & {
  username?: string | null;
};

export type PasswordUserCreationErrorCode =
  | 'EMAIL_ALREADY_EXISTS'
  | 'USERNAME_ALREADY_EXISTS'
  | 'INVALID_EMAIL'
  | 'INVALID_USERNAME'
  | 'INVALID_PASSWORD'
  | 'USER_NOT_PERSISTED'
  | 'CREDENTIAL_ACCOUNT_NOT_PERSISTED'
  | 'CREATION_FAILED';

/** Stable server-side errors returned by {@link Auth.createPasswordUser}. */
export class PasswordUserCreationError extends Error {
  readonly code: PasswordUserCreationErrorCode;

  constructor(
    code: PasswordUserCreationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PasswordUserCreationError';
    this.code = code;
  }
}

export class Auth {
  private readonly auth;
  private readonly options: Omit<AuthOptions, 'connection'>;

  constructor(options: AuthOptions) {
    const { connection, ...config } = options;
    if (!config.secret || config.secret.trim().length === 0) {
      throw new Error('Authentication secret is required.');
    }
    const plugins = config.plugins?.some((plugin) => plugin.id === 'username')
      ? config.plugins
      : [username({ displayUsername: false }), ...(config.plugins ?? [])];
    this.options = {
      ...config,
      appName: config.appName ?? 'NocoBase3',
      plugins,
      emailAndPassword: {
        ...config.emailAndPassword,
        enabled: config.emailAndPassword?.enabled ?? true,
      },
      advanced: {
        ...config.advanced,
        database: {
          ...config.advanced?.database,
          generateId:
            config.advanced?.database?.generateId ??
            (() => crypto.randomUUID()),
        },
      },
    };
    this.auth = createBetterAuth(connection, this.options);
  }

  handler(request: Request): Promise<Response> {
    return this.auth.handler(request);
  }

  getSession(headers: Headers): Promise<AuthSession> {
    return this.auth.api.getSession({ headers });
  }

  /**
   * Creates an email/password user without creating a session. The method does
   * all authentication writes in one transaction on the supplied connection.
   * When the supplied connection already belongs to a caller transaction, the
   * nested transaction remains governed by that caller transaction.
   */
  async createPasswordUser(
    input: CreatePasswordUserInput,
    options: CreatePasswordUserOptions,
  ): Promise<PasswordUser> {
    return options.connection.transaction(async (connection) => {
      const scopedAuth = createBetterAuth(connection, {
        ...this.options,
        emailAndPassword: {
          ...this.options.emailAndPassword,
          enabled: true,
          autoSignIn: false,
          disableSignUp: false,
          requireEmailVerification: false,
          onExistingUserSignUp: undefined,
        },
        emailVerification: {
          ...this.options.emailVerification,
          sendOnSignUp: false,
        },
      });
      const context = await scopedAuth.$context;
      const normalizedEmail = input.email.toLowerCase();
      if (await context.internalAdapter.findUserByEmail(normalizedEmail)) {
        throw passwordUserError('EMAIL_ALREADY_EXISTS');
      }

      let result;
      try {
        result = await scopedAuth.api.signUpEmail({ body: input });
      } catch (error) {
        throw normalizePasswordUserError(error);
      }
      const persisted = await context.internalAdapter.findUserById(
        result.user.id,
      );
      if (!persisted) {
        if (await context.internalAdapter.findUserByEmail(normalizedEmail)) {
          throw passwordUserError('EMAIL_ALREADY_EXISTS');
        }
        throw passwordUserError('USER_NOT_PERSISTED');
      }
      const credentialAccount =
        await context.internalAdapter.findCredentialAccount(persisted.id);
      if (
        !credentialAccount ||
        typeof credentialAccount.password !== 'string' ||
        credentialAccount.password.length === 0
      ) {
        throw passwordUserError('CREDENTIAL_ACCOUNT_NOT_PERSISTED');
      }
      const verified = await context.internalAdapter.updateUser(persisted.id, {
        emailVerified: true,
      });
      if (!verified) {
        throw passwordUserError('USER_NOT_PERSISTED');
      }
      return verified;
    });
  }

  optional(options: AuthMiddlewareOptions = {}): MiddlewareHandler<AuthEnv> {
    return async (context, next) => {
      if (options.skip?.(context)) {
        await next();
        return;
      }
      context.set('auth', await this.getSession(context.req.raw.headers));
      await next();
    };
  }

  required(options: AuthMiddlewareOptions = {}): MiddlewareHandler<AuthEnv> {
    return async (context, next) => {
      if (options.skip?.(context)) {
        await next();
        return;
      }
      const auth = await this.getSession(context.req.raw.headers);
      if (!auth) {
        return context.json(
          {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
          401,
        );
      }
      context.set('auth', auth);
      await next();
    };
  }
}

function createBetterAuth(
  connection: DatabaseConnection,
  options: Omit<AuthOptions, 'connection'>,
) {
  return betterAuth({
    ...options,
    database: databaseAdapter(connection),
  });
}

function normalizePasswordUserError(error: unknown): PasswordUserCreationError {
  if (error instanceof PasswordUserCreationError) {
    return error;
  }
  const sourceCode =
    error instanceof APIError &&
    error.body &&
    typeof error.body === 'object' &&
    'code' in error.body &&
    typeof error.body.code === 'string'
      ? error.body.code
      : undefined;
  const code = passwordUserErrorCode(sourceCode);
  return passwordUserError(code, error);
}

function passwordUserErrorCode(
  sourceCode: string | undefined,
): PasswordUserCreationErrorCode {
  switch (sourceCode) {
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'EMAIL_ALREADY_EXISTS';
    case 'USERNAME_IS_ALREADY_TAKEN':
      return 'USERNAME_ALREADY_EXISTS';
    case 'INVALID_EMAIL':
      return 'INVALID_EMAIL';
    case 'INVALID_USERNAME':
    case 'USERNAME_TOO_SHORT':
    case 'USERNAME_TOO_LONG':
      return 'INVALID_USERNAME';
    case 'INVALID_PASSWORD':
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
      return 'INVALID_PASSWORD';
    default:
      return 'CREATION_FAILED';
  }
}

function passwordUserError(
  code: PasswordUserCreationErrorCode,
  cause?: unknown,
): PasswordUserCreationError {
  const messages: Record<PasswordUserCreationErrorCode, string> = {
    EMAIL_ALREADY_EXISTS: 'A user with this email already exists.',
    USERNAME_ALREADY_EXISTS: 'A user with this username already exists.',
    INVALID_EMAIL: 'The email is invalid.',
    INVALID_USERNAME: 'The username is invalid.',
    INVALID_PASSWORD: 'The password is invalid.',
    USER_NOT_PERSISTED: 'Authentication did not persist the password user.',
    CREDENTIAL_ACCOUNT_NOT_PERSISTED:
      'Authentication did not persist the credential account.',
    CREATION_FAILED: 'Authentication could not create the password user.',
  };
  return new PasswordUserCreationError(
    code,
    messages[code],
    cause === undefined ? undefined : { cause },
  );
}

export function createAuthentication(
  options: CreateAuthenticationOptions,
): Auth {
  if (!options.connection) {
    throw new Error('Authentication requires a database connection.');
  }
  return new Auth({
    ...options,
    connection: options.connection,
  });
}
