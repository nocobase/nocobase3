import type { DatabaseConnection } from '@nocobase/db';
import {
  betterAuth,
  type BetterAuthOptions,
  type Session,
  type User,
} from 'better-auth';
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

export class Auth {
  private readonly auth;

  constructor(options: AuthOptions) {
    const { connection, ...config } = options;
    if (!config.secret || config.secret.trim().length === 0) {
      throw new Error('Authentication secret is required.');
    }
    this.auth = betterAuth({
      ...config,
      database: databaseAdapter(connection),
    });
  }

  get api(): ReturnType<typeof betterAuth>['api'] {
    return this.auth.api;
  }

  handler(request: Request): Promise<Response> {
    return this.auth.handler(request);
  }

  getSession(headers: Headers): Promise<AuthSession> {
    return this.auth.api.getSession({ headers });
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
