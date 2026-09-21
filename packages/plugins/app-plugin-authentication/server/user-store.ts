import type { DatabaseConnection } from '@nocobase/db';

/**
 * The storage contract Better Auth's `user` model is served through when the
 * users plugin is installed. The users plugin owns the `user` table and
 * provides the implementation; this plugin only declares the shape its
 * database adapter needs, which mirrors Better Auth's own adapter operations.
 */
export type UserStoreOperator =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'starts_with'
  | 'ends_with';

export interface UserStoreCondition {
  readonly field: string;
  readonly value: string | number | boolean | string[] | number[] | Date | null;
  readonly operator: UserStoreOperator;
  /** How this condition joins the previous one; the first one's is ignored. */
  readonly connector: 'AND' | 'OR';
  readonly mode: 'sensitive' | 'insensitive';
}

export interface UserStoreQuery {
  readonly where?: readonly UserStoreCondition[];
  readonly select?: readonly string[];
  readonly sortBy?: {
    readonly field: string;
    readonly direction: 'asc' | 'desc';
  };
  readonly offset?: number;
  readonly limit?: number;
}

/** How Better Auth names the user model and its columns in this application. */
export interface UserStoreModel {
  readonly model: string;
  /** Every physical column Better Auth knows for the model, `id` included. */
  readonly fields: readonly string[];
  /** Maps a logical Better Auth field name to its physical column. */
  field(name: string): string;
}

export interface UserStore {
  withConnection(connection: DatabaseConnection): UserStore;
  create<T extends Record<string, unknown>>(input: {
    readonly data: T;
    readonly select?: readonly string[];
  }): Promise<T>;
  findOne<T>(input: UserStoreQuery): Promise<T | null>;
  findMany<T>(input: UserStoreQuery): Promise<T[]>;
  count(input: UserStoreQuery): Promise<number>;
  update<T>(input: {
    readonly where: readonly UserStoreCondition[];
    readonly update: T;
  }): Promise<T | null>;
  updateMany(input: {
    readonly where: readonly UserStoreCondition[];
    readonly update: Record<string, unknown>;
  }): Promise<number>;
  delete(input: {
    readonly where: readonly UserStoreCondition[];
  }): Promise<void>;
  deleteMany(input: {
    readonly where: readonly UserStoreCondition[];
  }): Promise<number>;
  incrementOne<T>(input: {
    readonly where: readonly UserStoreCondition[];
    readonly increment: Record<string, number>;
    readonly set?: Record<string, unknown>;
  }): Promise<T | null>;
}

/** Builds a store bound to a connection; the adapter calls it again inside transactions. */
export type UserStoreFactory = (
  connection: DatabaseConnection,
  model: UserStoreModel,
) => UserStore;
