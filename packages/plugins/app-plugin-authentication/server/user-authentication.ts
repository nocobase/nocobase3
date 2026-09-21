import type { DatabaseConnection } from '@nocobase/db';
import type { RealtimeService } from '@nocobase/app-server/realtime';
import { APIError } from 'better-auth';

import type { Auth } from './auth.js';
import { UserStoreError } from './user-store.js';

/** Fields Better Auth accepts when a user is created from server code. */
export interface CreateUserRecordInput {
  readonly name: string;
  readonly email: string;
  readonly username?: string | null;
  readonly emailVerified?: boolean;
  readonly disabledAt?: Date | null;
}

/**
 * What only authentication can do to a user: passwords, credential accounts
 * and sessions. Reading and changing the user record is the users plugin's.
 */
export interface UserAuthenticationService {
  withConnection(connection: DatabaseConnection): UserAuthenticationService;
  /**
   * Runs Better Auth's user creation flow (hooks, plugin field defaults,
   * cached session bookkeeping). The row itself is written by the users
   * plugin's store, which applies the identity rules and raises conflicts.
   */
  createUser(input: CreateUserRecordInput): Promise<{ readonly id: string }>;
  /** Runs Better Auth's user update flow; also refreshes the user cached with each session. */
  updateUser(userId: string, data: Record<string, unknown>): Promise<void>;
  /** Rejects a password the configured policy does not allow, without touching the database. */
  assertPasswordAllowed(password: string): Promise<void>;
  createPasswordCredential(userId: string, password: string): Promise<void>;
  /** Rehashes, creates the credential when missing, and revokes every session. */
  resetPassword(userId: string, password: string): Promise<void>;
  /** Deletes database and cached sessions and disconnects realtime clients. */
  revokeSessions(userId: string): Promise<void>;
  /** Removes sessions and every sign-in account; for a user that is being deleted. */
  deleteCredentials(userId: string): Promise<void>;
}

export class UserAuthenticationError extends Error {
  constructor(
    readonly code:
      'USER_NOT_FOUND' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG',
    message: string,
  ) {
    super(message);
    this.name = 'UserAuthenticationError';
  }
}

export interface CreateUserAuthenticationServiceOptions {
  readonly auth: Auth;
  readonly connection: DatabaseConnection;
  readonly realtime?: RealtimeService;
}

export function createUserAuthenticationService(
  options: CreateUserAuthenticationServiceOptions,
): UserAuthenticationService {
  return new DefaultUserAuthenticationService(options);
}

class DefaultUserAuthenticationService implements UserAuthenticationService {
  constructor(
    private readonly options: CreateUserAuthenticationServiceOptions,
  ) {}

  withConnection(connection: DatabaseConnection): UserAuthenticationService {
    return new DefaultUserAuthenticationService({
      ...this.options,
      connection,
      auth: this.options.auth.forConnection(connection),
    });
  }

  async createUser(
    input: CreateUserRecordInput,
  ): Promise<{ readonly id: string }> {
    const context = await this.options.auth.administrationContext();
    const user = await unwrapStoreError(() =>
      context.internalAdapter.createUser(
        {
          ...input,
          emailVerified: input.emailVerified ?? false,
          disabledAt: input.disabledAt ?? null,
        },
        { method: 'admin' },
      ),
    );
    return { id: String(user.id) };
  }

  async updateUser(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const context = await this.options.auth.administrationContext();
    await unwrapStoreError(() =>
      context.internalAdapter.updateUser(userId, data),
    );
  }

  async assertPasswordAllowed(password: string): Promise<void> {
    const context = await this.options.auth.administrationContext();
    validatePassword(password, context.password.config);
  }

  async createPasswordCredential(
    userId: string,
    password: string,
  ): Promise<void> {
    const context = await this.options.auth.administrationContext();
    await this.requireUser(userId);
    validatePassword(password, context.password.config);
    await context.internalAdapter.createAccount({
      issuer: 'local:credential',
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await context.password.hash(password),
    });
  }

  async resetPassword(userId: string, password: string): Promise<void> {
    const context = await this.options.auth.administrationContext();
    await this.requireUser(userId);
    validatePassword(password, context.password.config);
    const hash = await context.password.hash(password);
    const account = await context.internalAdapter.findCredentialAccount(userId);
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
    await this.revokeSessions(userId);
  }

  async revokeSessions(userId: string): Promise<void> {
    const context = await this.options.auth.administrationContext();
    await this.requireUser(userId);
    await context.internalAdapter.deleteUserSessions(userId);
    this.options.realtime?.disconnectUser(userId);
  }

  async deleteCredentials(userId: string): Promise<void> {
    const context = await this.options.auth.administrationContext();
    await context.internalAdapter.deleteUserSessions(userId);
    await this.options.connection.query
      .deleteFrom('account')
      .where('userId', '=', userId)
      .execute();
    this.options.realtime?.disconnectUser(userId);
  }

  private async requireUser(userId: string): Promise<void> {
    const context = await this.options.auth.administrationContext();
    const user = await context.internalAdapter.findUserById(userId);
    if (!user || Reflect.get(user, 'deletedAt') != null) {
      throw new UserAuthenticationError(
        'USER_NOT_FOUND',
        `Unknown user: ${userId}`,
      );
    }
  }
}

/** The adapter wraps store errors for Better Auth; server-side callers get the original. */
async function unwrapStoreError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof APIError && error.cause instanceof UserStoreError) {
      throw error.cause;
    }
    throw error;
  }
}

function validatePassword(
  password: string,
  config: { minPasswordLength: number; maxPasswordLength: number },
): void {
  if (password.length < config.minPasswordLength) {
    throw new UserAuthenticationError(
      'PASSWORD_TOO_SHORT',
      `Password must be at least ${config.minPasswordLength} characters`,
    );
  }
  if (password.length > config.maxPasswordLength) {
    throw new UserAuthenticationError(
      'PASSWORD_TOO_LONG',
      `Password must be at most ${config.maxPasswordLength} characters`,
    );
  }
}
