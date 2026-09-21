import type { DatabaseConnection } from '@nocobase/db';
import type { UserLifecycleRegistry } from './lifecycle.js';

export interface UserCondition {
  field: string;
  value: string | number | boolean | string[] | number[] | Date | null;
  operator: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'ends_with';
  connector: 'AND' | 'OR';
  mode: 'sensitive' | 'insensitive';
}
export interface UserQuery {
  where?: UserCondition[];
  select?: string[];
  sortBy?: { field: string; direction: 'asc' | 'desc' };
  offset?: number;
  limit?: number;
}
export interface UserStoreOptions {
  model?: string;
  fields?: string[];
  field?: (name: string) => string;
  lifecycle?: UserLifecycleRegistry;
  actorId?: string;
}
export interface UserStore {
  withConnection(connection: DatabaseConnection): UserStore;
  create<T extends Record<string, unknown>>(input: { data: T; select?: string[] }): Promise<T>;
  findOne<T>(input: UserQuery): Promise<T | null>;
  findMany<T>(input: UserQuery): Promise<T[]>;
  count(input: UserQuery): Promise<number>;
  update<T>(input: { where: UserCondition[]; update: T }): Promise<T | null>;
  updateMany(input: { where: UserCondition[]; update: Record<string, unknown> }): Promise<number>;
  delete(input: { where: UserCondition[] }): Promise<void>;
  deleteMany(input: { where: UserCondition[] }): Promise<number>;
  incrementOne<T>(input: { where: UserCondition[]; increment: Record<string, number>; set?: Record<string, unknown> }): Promise<T | null>;
}
