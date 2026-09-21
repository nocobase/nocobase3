import { runWithAdapter } from '@better-auth/core/context';
import type { DatabaseConnection } from '@nocobase/db';
import type { RealtimeService } from '@nocobase/app-server/realtime';
import type { Auth } from './auth.js';

/** Lifecycle handler key authentication registers with the users plugin. */
export const AUTHENTICATION_USER_LIFECYCLE_KEY =
  'authentication.credentials' as const;

export class AuthenticationCredentialError extends Error {
  constructor(
    readonly code:
      'USER_NOT_FOUND' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG',
    message: string,
  ) {
    super(message);
    this.name = 'AuthenticationCredentialError';
  }
}

export interface AuthenticationCredentialService {
  withConnection(
    connection: DatabaseConnection,
  ): AuthenticationCredentialService;
  createPasswordCredential(userId: string, password: string): Promise<void>;
  resetPassword(userId: string, password: string): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
  deleteCredentials(userId: string): Promise<void>;
}

export interface CreateAuthenticationCredentialServiceOptions {
  readonly auth: Auth;
  readonly connection: DatabaseConnection;
  readonly realtime?: RealtimeService;
}

export function createAuthenticationCredentialService(
  options: CreateAuthenticationCredentialServiceOptions,
): AuthenticationCredentialService {
  return new DefaultAuthenticationCredentialService(options);
}

class DefaultAuthenticationCredentialService implements AuthenticationCredentialService {
  constructor(
    private readonly options: CreateAuthenticationCredentialServiceOptions,
  ) {}

  withConnection(
    connection: DatabaseConnection,
  ): AuthenticationCredentialService {
    return new DefaultAuthenticationCredentialService({
      ...this.options,
      connection,
      auth: this.options.auth.forConnection(connection),
    });
  }

  async createPasswordCredential(
    userId: string,
    password: string,
  ): Promise<void> {
    const context = await this.context();
    await this.requireUser(userId);
    validatePassword(password, context.password.config);
    const hash = await context.password.hash(password);
    await this.bound(context, () =>
      context.internalAdapter.createAccount({
        issuer: 'local:credential',
        accountId: userId,
        providerId: 'credential',
        userId,
        password: hash,
      }),
    );
  }

  async resetPassword(userId: string, password: string): Promise<void> {
    const context = await this.context();
    await this.requireUser(userId);
    validatePassword(password, context.password.config);
    const hash = await context.password.hash(password);
    await this.bound(context, async () => {
      const account =
        await context.internalAdapter.findCredentialAccount(userId);
      if (account) {
        await context.internalAdapter.updatePassword(userId, hash);
      } else {
        await context.internalAdapter.linkAccount({
          issuer: 'local:credential',
          accountId: userId,
          providerId: 'credential',
          userId,
          password: hash,
        });
      }
    });
    await this.revokeSessions(userId);
  }

  async revokeSessions(userId: string): Promise<void> {
    const context = await this.context();
    await this.requireUser(userId);
    await this.bound(context, () =>
      context.internalAdapter.deleteUserSessions(userId),
    );
    this.afterCommit(() => {
      this.options.realtime?.disconnectUser(userId);
    });
  }

  async deleteCredentials(userId: string): Promise<void> {
    const context = await this.context();
    await this.bound(context, () =>
      context.internalAdapter.deleteUserSessions(userId),
    );
    await this.options.connection.query
      .deleteFrom('account')
      .where('userId', '=', userId)
      .execute();
    this.afterCommit(() => {
      this.options.realtime?.disconnectUser(userId);
    });
  }

  /**
   * Better Auth resolves the adapter its internal operations write through
   * from the ambient request context, not from the instance they were called
   * on. Inside a Better Auth request that would send this service's writes to
   * the request's own connection instead of the transaction it is bound to.
   */
  private async bound<T>(
    context: Awaited<ReturnType<Auth['credentialContext']>>,
    run: () => Promise<T>,
  ): Promise<T> {
    return await runWithAdapter(context.adapter, run);
  }

  private async context(): Promise<
    Awaited<ReturnType<Auth['credentialContext']>>
  > {
    return this.options.auth.credentialContext();
  }

  private async requireUser(userId: string): Promise<void> {
    if (!(await this.options.auth.users.get(userId))) {
      throw new AuthenticationCredentialError(
        'USER_NOT_FOUND',
        `Unknown user: ${userId}`,
      );
    }
  }

  private afterCommit(effect: () => void | Promise<void>): void {
    if (this.options.connection.inTransaction)
      this.options.connection.afterCommit(effect);
    else void effect();
  }
}

function validatePassword(
  password: string,
  config: { minPasswordLength: number; maxPasswordLength: number },
): void {
  if (password.length < config.minPasswordLength) {
    throw new AuthenticationCredentialError(
      'PASSWORD_TOO_SHORT',
      `Password must be at least ${config.minPasswordLength} characters`,
    );
  }
  if (password.length > config.maxPasswordLength) {
    throw new AuthenticationCredentialError(
      'PASSWORD_TOO_LONG',
      `Password must be at most ${config.maxPasswordLength} characters`,
    );
  }
}
