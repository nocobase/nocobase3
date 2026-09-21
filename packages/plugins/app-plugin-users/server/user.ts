import type { DatabaseConnection } from '@nocobase/db';
import type { Knex } from 'knex';
export interface User {
  readonly id: string;
  readonly name: string;
  readonly username?: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly disabledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class UserError extends Error {
  constructor(
    readonly code:
      | 'USER_NOT_FOUND'
      | 'USER_EMAIL_CONFLICT'
      | 'USER_USERNAME_CONFLICT'
      | 'USER_IDENTITY_CONFLICT'
,
    message: string,
  ) {
    super(message);
    this.name = 'UserError';
  }
}

export const userFields = [
  'id',
  'name',
  'username',
  'email',
  'emailVerified',
  'disabledAt',
  'createdAt',
  'updatedAt',
  'image',
  'deletedAt',
  'deletedBy',
] as const;

export function toUser(row: Record<string, unknown>): User {
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

export function throwIdentityConflict(error: unknown): never {
  if (isUniqueConstraintViolation(error)) {
    throw new UserError(
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

/** Serialize account deletion with creation of resources owned by that account. Use inside a transaction. */
export async function lockUser(
  connection: DatabaseConnection,
  userId: string,
  model: string = 'user',
): Promise<void> {
  if (connection.dialect === 'sqlite') {
    await connection.query
      .updateTable(model)
      .set({ id: userId })
      .where('id', '=', userId)
      .execute();
    return;
  }
  const physical = await connection.collections.getPhysical(model);
  if (!physical) throw new Error('User schema is unavailable');
  const knex = await connection.client<Knex>();
  await knex(physical.tableName).where({ id: userId }).select('id').forUpdate();
}

export function normalizeUserWrite(input: Record<string, unknown>, field: (key: string) => string, create: boolean): Record<string, unknown> {
  const data = { ...input };
  for (const name of ['email', 'username', 'name']) {
    const key = field(name);
    if (data[key] === undefined) continue;
    if (name === 'username' && data[key] === null) continue;
    if (typeof data[key] !== 'string') throw new TypeError(`Invalid user ${name}`);
    data[key] = name === 'email' ? normalizedEmail(data[key]) : name === 'username' ? optionalUsername(data[key]) ?? null : requiredText(data[key], 'User name');
  }
  if (create && (!data[field('email')] || !data[field('name')])) throw new TypeError('User name and email are required.');
  return data;
}

export async function assertIdentityAvailable(connection: DatabaseConnection, model: string, field: (key: string) => string, data: Record<string, unknown>, excludeId?: string): Promise<void> {
  for (const name of ['email', 'username'] as const) {
    const value = data[field(name)];
    if (value == null) continue;
    let query = connection.query.selectFrom(model).select('id').where(field(name), '=', value);
    if (excludeId !== undefined) query = query.where('id', '<>', excludeId);
    if (await query.executeTakeFirst()) throw new UserError(name === 'email' ? 'USER_EMAIL_CONFLICT' : 'USER_USERNAME_CONFLICT', `A user with this ${name} already exists`);
  }
}
