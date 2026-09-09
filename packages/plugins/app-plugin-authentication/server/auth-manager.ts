import type { DatabaseConnection } from '@nocobase/db';
import {
  betterAuth,
  type BetterAuthOptions,
  type BetterAuthPlugin,
  type Session,
  type User,
} from 'better-auth';
import type { username } from 'better-auth/plugins';
import type { Context, MiddlewareHandler } from 'hono';
import { databaseAdapter } from './better-auth/database-adapter.js';

export interface AuthOptions extends Omit<BetterAuthOptions, 'database'> {
  connection: DatabaseConnection;
}

export type AuthSession = { user: User; session: Session } | null;

export interface AuthEnv {
  Variables: { auth: AuthSession };
}

export interface AuthMiddlewareOptions {
  skip?: (context: Context) => boolean;
}

/** Plugins may augment this interface from their server entry point. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AuthenticationPluginTypes {}

type ExtensionPlugin = Extract<
  AuthenticationPluginTypes[keyof AuthenticationPluginTypes],
  BetterAuthPlugin
>;
type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer I) => void
  ? I
  : never;
type LastOf<T> =
  UnionToIntersection<
    T extends unknown ? () => T : never
  > extends () => infer Last
    ? Last
    : never;
type PluginTuple<T, Last = LastOf<T>> = [T] extends [never]
  ? []
  : [...PluginTuple<Exclude<T, Last>>, Last];

type ServerAuthOptions = Omit<BetterAuthOptions, 'plugins'> & {
  plugins: [ReturnType<typeof username>, ...PluginTuple<ExtensionPlugin>];
};
export type ServerAuth = ReturnType<typeof betterAuth<ServerAuthOptions>>;

export type AuthOptionsPatch = Omit<
  BetterAuthOptions,
  'database' | 'plugins' | 'socialProviders'
>;

/** Collects configuration during register; creates authentication during boot. */
export class AuthManager {
  private readonly plugins: BetterAuthPlugin[] = [];
  private providers: NonNullable<BetterAuthOptions['socialProviders']> = {};
  private options: AuthOptionsPatch = {};
  private instance?: ServerAuth;

  plugin(plugin: BetterAuthPlugin): void {
    this.plugins.push(plugin);
  }

  socialProviders(
    providers: NonNullable<BetterAuthOptions['socialProviders']>,
  ): void {
    this.providers = { ...this.providers, ...providers };
  }

  mergeOptions(options: AuthOptionsPatch): void {
    this.options = { ...this.options, ...options };
  }

  init({ connection, ...options }: AuthOptions): void {
    this.instance = betterAuth<ServerAuthOptions>({
      ...options,
      ...this.options,
      database: databaseAdapter(connection),
      plugins: [
        ...(options.plugins ?? []),
        ...this.plugins,
      ] as ServerAuthOptions['plugins'],
      socialProviders: { ...options.socialProviders, ...this.providers },
    });
  }

  get auth(): ServerAuth {
    if (!this.instance)
      throw new Error(
        'Authentication is not initialized. Access authentication after AuthenticationProvider.boot().',
      );
    return this.instance;
  }

  get api(): ServerAuth['api'] {
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
