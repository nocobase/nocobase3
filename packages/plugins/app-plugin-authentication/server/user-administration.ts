import type { DatabaseConnection } from '@nocobase/db';
import type { RealtimeService } from '@nocobase/app-server/realtime';

import type { Auth } from './auth.js';

export interface AdministratedUser {
  readonly id: string;
  readonly name: string;
  readonly username?: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly disabledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

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
}

export class UserAdministrationError extends Error {
  constructor(
    readonly code:
      | 'USER_NOT_FOUND'
      | 'USER_EMAIL_CONFLICT'
      | 'USER_USERNAME_CONFLICT'
      | 'USER_IDENTITY_CONFLICT'
      | 'PASSWORD_TOO_SHORT'
      | 'PASSWORD_TOO_LONG',
    message: string,
  ) {
    super(message);
    this.name = 'UserAdministrationError';
  }
}

export interface CreateUserAdministrationServiceOptions {
  readonly auth: Auth;
  readonly connection: DatabaseConnection;
  readonly realtime?: RealtimeService;
}

export function createUserAdministrationService(
  options: CreateUserAdministrationServiceOptions,
): UserAdministrationService {
  return new DefaultUserAdministrationService(options);
}

class DefaultUserAdministrationService implements UserAdministrationService {
  constructor(
    private readonly options: CreateUserAdministrationServiceOptions,
  ) {}

  withConnection(connection: DatabaseConnection): UserAdministrationService {
    return new DefaultUserAdministrationService({
      ...this.options,
      connection,
      auth: this.options.auth.forConnection(connection),
    });
  }

  async list(
    input: ListAdministratedUsersInput = {},
  ): Promise<AdministratedUserPage> {
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(positiveInteger(input.pageSize, 20), 100);
    let query = this.options.connection.query.selectFrom('user');
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
      .select(userColumns)
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
    const row = await this.options.connection.query
      .selectFrom('user')
      .select(userColumns)
      .where('id', '=', userId)
      .executeTakeFirst();
    return row ? toAdministratedUser(row) : undefined;
  }

  async create(
    input: CreateAdministratedUserInput,
  ): Promise<AdministratedUser> {
    const context = await this.options.auth.administrationContext();
    validatePassword(input.password, context.password.config);
    const username = optionalUsername(input.username);
    const email = normalizedEmail(input.email);
    await this.assertIdentityAvailable({ email, username });
    const user = await context.internalAdapter
      .createUser(
        {
          name: requiredText(input.name, 'User name'),
          username,
          email,
          emailVerified: false,
          disabledAt: null,
        },
        { method: 'admin' },
      )
      .catch(throwIdentityConflict);
    await context.internalAdapter.createAccount({
      issuer: 'local:credential',
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: await context.password.hash(input.password),
    });
    return (await this.get(user.id))!;
  }

  async update(
    userId: string,
    input: UpdateAdministratedUserInput,
  ): Promise<AdministratedUser> {
    await this.requireUser(userId);
    const context = await this.options.auth.administrationContext();
    const username =
      input.username === undefined
        ? undefined
        : (optionalUsername(input.username ?? undefined) ?? null);
    const email =
      input.email === undefined ? undefined : normalizedEmail(input.email);
    await this.assertIdentityAvailable(
      {
        ...(email === undefined ? {} : { email }),
        ...(username == null ? {} : { username }),
      },
      userId,
    );
    try {
      await context.internalAdapter.updateUser(userId, {
        ...(input.name === undefined
          ? {}
          : { name: requiredText(input.name, 'User name') }),
        ...(input.username === undefined ? {} : { username }),
        ...(email === undefined ? {} : { email }),
      });
    } catch (error) {
      throwIdentityConflict(error);
    }
    return (await this.get(userId))!;
  }

  async disable(userId: string): Promise<AdministratedUser> {
    await this.requireUser(userId);
    const context = await this.options.auth.administrationContext();
    await context.internalAdapter.updateUser(userId, {
      disabledAt: new Date(),
    });
    await this.revokeSessions(userId);
    return (await this.get(userId))!;
  }

  async enable(userId: string): Promise<AdministratedUser> {
    await this.requireUser(userId);
    const context = await this.options.auth.administrationContext();
    await context.internalAdapter.updateUser(userId, { disabledAt: null });
    return (await this.get(userId))!;
  }

  async resetPassword(userId: string, password: string): Promise<void> {
    await this.requireUser(userId);
    const context = await this.options.auth.administrationContext();
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
    await this.requireUser(userId);
    const context = await this.options.auth.administrationContext();
    await context.internalAdapter.deleteUserSessions(userId);
    this.options.realtime?.disconnectUser(userId);
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

  private async assertIdentityAvailable(
    identity: { readonly email?: string; readonly username?: string },
    excludeUserId?: string,
  ): Promise<void> {
    for (const [field, value, code, message] of [
      [
        'email',
        identity.email,
        'USER_EMAIL_CONFLICT',
        'A user with this email already exists',
      ],
      [
        'username',
        identity.username,
        'USER_USERNAME_CONFLICT',
        'A user with this username already exists',
      ],
    ] as const) {
      if (value === undefined) continue;
      let query = this.options.connection.query
        .selectFrom('user')
        .select('id')
        .where(field, '=', value);
      if (excludeUserId !== undefined) {
        query = query.where('id', '<>', excludeUserId);
      }
      if (await query.executeTakeFirst()) {
        throw new UserAdministrationError(code, message);
      }
    }
  }
}

const userColumns = [
  'id',
  'name',
  'username',
  'email',
  'emailVerified',
  'disabledAt',
  'createdAt',
  'updatedAt',
] as const;

function toAdministratedUser(row: Record<string, unknown>): AdministratedUser {
  return {
    id: scalarString(row.id, 'user ID'),
    name: scalarString(row.name, 'user name'),
    ...(row.username == null
      ? {}
      : { username: scalarString(row.username, 'username') }),
    email: scalarString(row.email, 'user email'),
    emailVerified: Boolean(row.emailVerified),
    disabledAt:
      row.disabledAt == null ? null : dateValue(row.disabledAt, 'disabledAt'),
    createdAt: dateValue(row.createdAt, 'createdAt'),
    updatedAt: dateValue(row.updatedAt, 'updatedAt'),
  };
}

function scalarString(value: unknown, label: string): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  throw new Error(`Invalid ${label}`);
}

function dateValue(value: unknown, label: string): Date {
  if (value instanceof Date) return value;
  const numericString =
    typeof value === 'string' && /^-?\d+(?:\.\d+)?$/u.test(value.trim())
      ? Number(value)
      : undefined;
  const date =
    typeof value === 'number'
      ? new Date(value)
      : typeof value === 'bigint'
        ? new Date(Number(value))
        : typeof value === 'string'
          ? new Date(numericString ?? value)
          : undefined;
  if (!date) throw new Error(`Invalid ${label}`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${label}`);
  return date;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty`);
  return normalized;
}

function optionalUsername(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function normalizedEmail(value: string): string {
  return requiredText(value, 'User email').toLowerCase();
}

function throwIdentityConflict(error: unknown): never {
  if (isUniqueConstraintViolation(error)) {
    throw new UserAdministrationError(
      'USER_IDENTITY_CONFLICT',
      'A user with this email or username already exists',
    );
  }
  throw error;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    const number = record.errno ?? record.number ?? record.errorNum;
    if (
      record.code === '23505' ||
      record.code === 'ER_DUP_ENTRY' ||
      record.code === 'SQLITE_CONSTRAINT' ||
      record.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      record.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
      number === 1 ||
      number === 1062 ||
      number === 2601 ||
      number === 2627
    ) {
      return true;
    }
    current = record.cause ?? record.originalError;
  }
  return false;
}

function validatePassword(
  password: string,
  config: { minPasswordLength: number; maxPasswordLength: number },
): void {
  if (password.length < config.minPasswordLength) {
    throw new UserAdministrationError(
      'PASSWORD_TOO_SHORT',
      `Password must be at least ${config.minPasswordLength} characters`,
    );
  }
  if (password.length > config.maxPasswordLength) {
    throw new UserAdministrationError(
      'PASSWORD_TOO_LONG',
      `Password must be at most ${config.maxPasswordLength} characters`,
    );
  }
}
