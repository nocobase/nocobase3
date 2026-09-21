import type { DatabaseConnection } from '@nocobase/db';
import type { UserAuthenticationService } from '@nocobase/app-plugin-authentication';

import {
  administratedUserColumns,
  assertIdentityAvailable,
  lockUser,
  normalizeUserWrite,
  toAdministratedUser,
  USER_MODEL,
  UserAdministrationError,
  type AdministratedUser,
} from './user-record.js';

export interface ListAdministratedUsersInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly status?: 'enabled' | 'disabled';
  readonly userIds?: readonly string[];
}

export interface AdministratedUserPage {
  readonly items: readonly AdministratedUser[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateAdministratedUserInput {
  readonly name: string;
  readonly username?: string;
  readonly email: string;
  readonly password: string;
}

export interface UpdateAdministratedUserInput {
  readonly name?: string;
  readonly username?: string | null;
  readonly email?: string;
}

/**
 * The user record and the administrator flows on it. This plugin owns the
 * `user` table: reads query it here, and writes run Better Auth's user write
 * flow through `UserAuthenticationService` so hooks, plugin field defaults and
 * cached sessions stay consistent, while the row is written by this plugin's
 * store. Passwords, credential accounts and sessions are authentication's.
 */
export interface UserAdministrationService {
  withConnection(connection: DatabaseConnection): UserAdministrationService;
  list(input?: ListAdministratedUsersInput): Promise<AdministratedUserPage>;
  get(userId: string): Promise<AdministratedUser | undefined>;
  create(input: CreateAdministratedUserInput): Promise<AdministratedUser>;
  update(
    userId: string,
    input: UpdateAdministratedUserInput,
  ): Promise<AdministratedUser>;
  disable(userId: string): Promise<AdministratedUser>;
  enable(userId: string): Promise<AdministratedUser>;
  resetPassword(userId: string, password: string): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
  remove(userId: string, actorId: string): Promise<void>;
}

export interface CreateUserAdministrationServiceOptions {
  readonly connection: DatabaseConnection;
  readonly credentials: UserAuthenticationService;
}

/** The administration service addresses the default model, whose columns carry their logical names. */
const column = (name: string): string => name;

export function createUserAdministrationService(
  options: CreateUserAdministrationServiceOptions,
): UserAdministrationService {
  return new DefaultUserAdministrationService(options);
}

class DefaultUserAdministrationService implements UserAdministrationService {
  constructor(
    private readonly options: CreateUserAdministrationServiceOptions,
  ) {}

  private get connection(): DatabaseConnection {
    return this.options.connection;
  }

  withConnection(connection: DatabaseConnection): UserAdministrationService {
    return new DefaultUserAdministrationService({
      ...this.options,
      connection,
      credentials: this.options.credentials.withConnection(connection),
    });
  }

  async list(
    input: ListAdministratedUsersInput = {},
  ): Promise<AdministratedUserPage> {
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(positiveInteger(input.pageSize, 20), 100);
    let query = this.connection.query
      .selectFrom(USER_MODEL)
      .where('deletedAt', 'is', null);
    if (input.status === 'enabled')
      query = query.where('disabledAt', 'is', null);
    if (input.status === 'disabled')
      query = query.where('disabledAt', 'is not', null);
    if (input.userIds) {
      if (input.userIds.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
      query = query.where('id', 'in', [...input.userIds]);
    }
    const search = input.search?.trim();
    if (search) {
      query = query.where((builder) =>
        builder.or([
          builder('name', 'like', `%${search}%`),
          builder('username', 'like', `%${search}%`),
          builder('email', 'like', `%${search}%`),
        ]),
      );
    }
    const countRow = await query
      .select(({ fn }) => [fn.countAll().as('count')])
      .executeTakeFirst<{ count: number | string }>();
    const rows = await query
      .select(administratedUserColumns)
      .orderBy('createdAt', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute();
    return {
      items: rows.map(toAdministratedUser),
      total: Number(countRow?.count ?? 0),
      page,
      pageSize,
    };
  }

  async get(userId: string): Promise<AdministratedUser | undefined> {
    const row = await this.connection.query
      .selectFrom(USER_MODEL)
      .select(administratedUserColumns)
      .where('id', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return row ? toAdministratedUser(row) : undefined;
  }

  async create(
    input: CreateAdministratedUserInput,
  ): Promise<AdministratedUser> {
    // Refuse a bad password or a taken identity before anything is written;
    // the store enforces the same rules again when the row is inserted.
    await this.options.credentials.assertPasswordAllowed(input.password);
    const data = normalizeUserWrite(
      {
        name: input.name,
        username: input.username ?? null,
        email: input.email,
      },
      column,
      true,
    );
    await assertIdentityAvailable(this.connection, USER_MODEL, column, data);
    const user = await this.options.credentials.createUser({
      name: String(data.name),
      username: (data.username as string | null) ?? null,
      email: String(data.email),
    });
    await this.options.credentials.createPasswordCredential(
      user.id,
      input.password,
    );
    return (await this.get(user.id))!;
  }

  async update(
    userId: string,
    input: UpdateAdministratedUserInput,
  ): Promise<AdministratedUser> {
    await this.requireUser(userId);
    const data = normalizeUserWrite(
      {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.username === undefined ? {} : { username: input.username }),
        ...(input.email === undefined ? {} : { email: input.email }),
      },
      column,
      false,
    );
    await assertIdentityAvailable(
      this.connection,
      USER_MODEL,
      column,
      data,
      userId,
    );
    await this.options.credentials.updateUser(userId, data);
    return (await this.get(userId))!;
  }

  async disable(userId: string): Promise<AdministratedUser> {
    await this.requireUser(userId);
    await this.setStatus(userId, { disabledAt: new Date() });
    await this.options.credentials.revokeSessions(userId);
    return (await this.get(userId))!;
  }

  async enable(userId: string): Promise<AdministratedUser> {
    await this.requireUser(userId);
    await this.setStatus(userId, { disabledAt: null });
    return (await this.get(userId))!;
  }

  resetPassword(userId: string, password: string): Promise<void> {
    return this.options.credentials.resetPassword(userId, password);
  }

  revokeSessions(userId: string): Promise<void> {
    return this.options.credentials.revokeSessions(userId);
  }

  async remove(userId: string, actorId: string): Promise<void> {
    if (userId === actorId)
      throw new TypeError('You cannot delete your own account.');
    await lockUser(this.connection, userId);
    if (!(await this.get(userId))) return;
    const now = new Date();
    await this.setStatus(userId, {
      disabledAt: now,
      deletedAt: now,
      deletedBy: actorId,
    });
    await this.options.credentials.deleteCredentials(userId);
  }

  private setStatus(
    userId: string,
    status: Record<string, Date | string | null>,
  ): Promise<void> {
    return this.options.credentials.updateUser(userId, status);
  }

  private async requireUser(userId: string): Promise<AdministratedUser> {
    const user = await this.get(userId);
    if (!user) {
      throw new UserAdministrationError(
        'USER_NOT_FOUND',
        `Unknown user: ${userId}`,
      );
    }
    return user;
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}
