import type { DatabaseConnection } from '@nocobase/database';
import { betterAuth, type BetterAuthOptions, type Session, type User } from 'better-auth';
import type { MiddlewareHandler } from 'hono';
import { databaseAdapter } from './better-auth/database-adapter.js';

export interface AuthOptions extends Omit<BetterAuthOptions, 'database'> {
  connection: DatabaseConnection;
}

export type AuthSession = { user: User; session: Session } | null;

export interface AuthEnv {
  Variables: { auth: AuthSession };
}

export class Auth {
  private readonly auth;

  constructor(options: AuthOptions) {
    const { connection, ...config } = options;
    this.auth = betterAuth({
      ...config,
      appName: config.appName ?? 'NocoBase V3',
      database: databaseAdapter(connection),
      emailAndPassword: {
        ...config.emailAndPassword,
        enabled: config.emailAndPassword?.enabled ?? true,
      },
      advanced: {
        ...config.advanced,
        database: {
          ...config.advanced?.database,
          generateId: config.advanced?.database?.generateId ?? (() => crypto.randomUUID()),
        },
      },
    });
  }

  handler(request: Request): Promise<Response> {
    return this.auth.handler(request);
  }

  getSession(headers: Headers): Promise<AuthSession> {
    return this.auth.api.getSession({ headers });
  }

  optionalSession(): MiddlewareHandler<AuthEnv> {
    return async (context, next) => {
      context.set('auth', await this.getSession(context.req.raw.headers));
      await next();
    };
  }

  requireSession(): MiddlewareHandler<AuthEnv> {
    return async (context, next) => {
      const auth = await this.getSession(context.req.raw.headers);
      if (!auth) {
        return context.json({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        }, 401);
      }
      context.set('auth', auth);
      await next();
    };
  }
}
