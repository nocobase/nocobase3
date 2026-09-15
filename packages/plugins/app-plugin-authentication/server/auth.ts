import type { DatabaseConnection } from '@nocobase/db';
import {
  APIError,
  betterAuth,
  type BetterAuthOptions,
  type Session,
  type User,
} from 'better-auth';
import { username } from 'better-auth/plugins';
import type { Context, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
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

export class Auth {
  private readonly auth;
  private readonly connection: DatabaseConnection;
  private readonly options: AuthOptions;

  constructor(options: AuthOptions) {
    const { connection, ...config } = options;
    this.connection = connection;
    this.options = options;
    if (!config.secret || config.secret.trim().length === 0) {
      throw new Error('Authentication secret is required.');
    }
    const plugins = (config.plugins ?? []).some(
      (plugin) => Reflect.get(plugin, 'id') === 'username',
    )
      ? config.plugins
      : [username({ displayUsername: false }), ...(config.plugins ?? [])];
    const configuredSessionCreate = config.databaseHooks?.session?.create;
    this.auth = betterAuth({
      ...config,
      appName: config.appName ?? 'NocoBase3',
      database: databaseAdapter(connection),
      plugins,
      emailAndPassword: {
        ...config.emailAndPassword,
        enabled: config.emailAndPassword?.enabled ?? true,
      },
      user: {
        ...config.user,
        additionalFields: {
          ...config.user?.additionalFields,
          disabledAt: {
            type: 'date',
            required: false,
            input: false,
          },
        },
      },
      databaseHooks: {
        ...config.databaseHooks,
        session: {
          ...config.databaseHooks?.session,
          create: {
            ...configuredSessionCreate,
            before: async (session, context) => {
              const configuredResult = await configuredSessionCreate?.before?.(
                session,
                context,
              );
              if (configuredResult === false) return false;
              const candidate =
                typeof configuredResult === 'object' &&
                configuredResult !== null &&
                'data' in configuredResult
                  ? { ...session, ...configuredResult.data }
                  : session;
              const user = context
                ? await context.context.internalAdapter.findUserById(
                    candidate.userId,
                  )
                : await connection.query
                    .selectFrom('user')
                    .select(['id', 'disabledAt'])
                    .where('id', '=', candidate.userId)
                    .executeTakeFirst();
              if (!user || Reflect.get(user, 'disabledAt') != null) {
                throw APIError.from('FORBIDDEN', {
                  code: 'ACCOUNT_DISABLED',
                  message: 'This account is disabled.',
                });
              }
              return configuredResult;
            },
          },
        },
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
    });
  }

  handler(request: Request): Promise<Response> {
    return this.auth.handler(request);
  }

  async getSession(headers: Headers): Promise<AuthSession> {
    try {
      return await this.authenticate(headers);
    } catch (reason) {
      if (isRejectedCredential(reason)) return null;
      throw reason;
    }
  }

  /**
   * Resolves the session, throwing Better Auth's APIError when a credential is
   * present but refused.
   *
   * A bad cookie yields null. A plugin that authenticates by header — an API
   * key — throws instead, saying why, and `required()` and `optional()`
   * forward that answer. `getSession()` folds it into null for callers that
   * only need to know who, if anyone, is signed in.
   */
  private async authenticate(headers: Headers): Promise<AuthSession> {
    const session = await this.auth.api.getSession({ headers });
    if (!session) return null;
    const user = await this.connection.query
      .selectFrom('user')
      .select(['id', 'disabledAt'])
      .where('id', '=', session.user.id)
      .executeTakeFirst();
    if (!user || user.disabledAt != null) return null;
    return session;
  }

  /** @internal Used by the Authentication-owned administration service. */
  administrationContext(): typeof this.auth.$context {
    return this.auth.$context;
  }

  /** @internal Binds Authentication operations to a caller-owned transaction. */
  forConnection(connection: DatabaseConnection): Auth {
    return new Auth({ ...this.options, connection });
  }

  optional(options: AuthMiddlewareOptions = {}): MiddlewareHandler<AuthEnv> {
    return async (context, next) => {
      if (options.skip?.(context)) {
        await next();
        return;
      }
      try {
        context.set('auth', await this.authenticate(context.req.raw.headers));
      } catch (reason) {
        if (isRejectedCredential(reason)) return refuse(context, reason);
        throw reason;
      }
      await next();
    };
  }

  required(options: AuthMiddlewareOptions = {}): MiddlewareHandler<AuthEnv> {
    return async (context, next) => {
      if (options.skip?.(context)) {
        await next();
        return;
      }
      let auth: AuthSession;
      try {
        auth = await this.authenticate(context.req.raw.headers);
      } catch (reason) {
        if (isRejectedCredential(reason)) return refuse(context, reason);
        throw reason;
      }
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

/** A 4xx from Better Auth is the credential being refused; a 5xx is a failure. */
function isRejectedCredential(reason: unknown): reason is APIError {
  return reason instanceof APIError && reason.statusCode < 500;
}

/** Answers with Better Auth's own status and body, so the caller learns why. */
function refuse(context: Context, reason: APIError): Response {
  return context.json(
    reason.body ?? { code: 'UNAUTHORIZED', message: reason.message },
    reason.statusCode as ContentfulStatusCode,
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
