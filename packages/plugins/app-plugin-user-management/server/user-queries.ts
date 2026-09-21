import type { DatabaseConnection } from '@nocobase/db';
import { toUser, type User } from '@nocobase/app-plugin-users/server';

export interface ListManagedUsersQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly status?: 'enabled' | 'disabled';
  readonly userIds?: readonly string[];
}

export interface ManagedUserPage {
  readonly items: readonly User[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface UserQueryService {
  withConnection(connection: DatabaseConnection): UserQueryService;
  list(input?: ListManagedUsersQuery): Promise<ManagedUserPage>;
  get(userId: string): Promise<User | undefined>;
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

export function createUserQueryService(
  connection: DatabaseConnection,
): UserQueryService {
  return new DefaultUserQueryService(connection);
}

class DefaultUserQueryService implements UserQueryService {
  constructor(private readonly connection: DatabaseConnection) {}

  withConnection(connection: DatabaseConnection): UserQueryService {
    return new DefaultUserQueryService(connection);
  }

  async list(input: ListManagedUsersQuery = {}): Promise<ManagedUserPage> {
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(positiveInteger(input.pageSize, 20), 100);
    let query = this.connection.query
      .selectFrom('user')
      .where('deletedAt', 'is', null);
    if (input.status === 'enabled')
      query = query.where('disabledAt', 'is', null);
    if (input.status === 'disabled')
      query = query.where('disabledAt', 'is not', null);
    if (input.userIds) {
      if (input.userIds.length === 0)
        return { items: [], total: 0, page, pageSize };
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
      items: rows.map((row) => toUser(row as Record<string, unknown>)),
      total: Number(countRow?.count ?? 0),
      page,
      pageSize,
    };
  }

  async get(userId: string): Promise<User | undefined> {
    const row = await this.connection.query
      .selectFrom('user')
      .select(userColumns)
      .where('id', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return row ? toUser(row) : undefined;
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}
