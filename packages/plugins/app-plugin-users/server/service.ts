import type { DatabaseConnection } from '@nocobase/db';
import { createUserStore } from './store.js';
import { UserError, toUser, type User } from './user.js';
import type { UserCondition, UserStoreOptions } from './store-types.js';

export interface CreateUserInput {
  name: string;
  email: string;
  username?: string;
}
export interface UpdateUserInput {
  name?: string;
  email?: string;
  username?: string | null;
}
export function userIdCondition(id: string): UserCondition[] {
  return [
    {
      field: 'id',
      value: id,
      operator: 'eq',
      connector: 'AND',
      mode: 'sensitive',
    },
  ];
}
export class UserService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly options: UserStoreOptions = {},
    private readonly generateId: () => string = () => crypto.randomUUID(),
  ) {}
  withConnection(connection: DatabaseConnection): UserService {
    return new UserService(connection, this.options, this.generateId);
  }
  async get(id: string): Promise<User | undefined> {
    const row = await createUserStore(this.connection, this.options).findOne<
      Record<string, unknown>
    >({ where: userIdCondition(id) });
    return row ? toUser(row) : undefined;
  }
  async require(id: string): Promise<User> {
    const user = await this.get(id);
    if (!user) throw new UserError('USER_NOT_FOUND', `Unknown user: ${id}`);
    return user;
  }
  async create(input: CreateUserInput): Promise<User> {
    const row = await createUserStore(this.connection, this.options).create({
      data: {
        id: this.generateId(),
        name: input.name,
        email: input.email,
        username: input.username ?? null,
        emailVerified: false,
        disabledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return toUser(row);
  }
  async updateProfile(id: string, input: UpdateUserInput): Promise<User> {
    const patch = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.username === undefined ? {} : { username: input.username }),
      updatedAt: new Date(),
    };
    return this.update(id, patch);
  }
  disable(id: string): Promise<User> {
    return this.update(id, { disabledAt: new Date(), updatedAt: new Date() });
  }
  enable(id: string): Promise<User> {
    return this.update(id, { disabledAt: null, updatedAt: new Date() });
  }
  /** Soft-deletes; repeating it is a no-op. Operator policy such as self-deletion is the caller's. */
  async remove(id: string, actorId?: string): Promise<void> {
    await createUserStore(this.connection, { ...this.options, actorId }).delete(
      { where: userIdCondition(id) },
    );
  }
  private async update(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<User> {
    const row = await createUserStore(this.connection, this.options).update<
      Record<string, unknown>
    >({ where: userIdCondition(id), update: patch });
    if (!row) throw new UserError('USER_NOT_FOUND', `Unknown user: ${id}`);
    return toUser(row);
  }
}
