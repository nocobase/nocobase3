import type { DatabaseConnection } from '@nocobase/app-database';

export type QueryOperator<T> =
  | T
  | readonly T[]
  | {
      $in?: readonly T[];
      $notIn?: readonly T[];
      $ne?: T;
      $lt?: T;
      $lte?: T;
      $gt?: T;
      $gte?: T;
    };

export type CollectionFilter<T extends object> = {
  [K in keyof T]?: QueryOperator<T[K]>;
};

export type CollectionSort<T extends object> =
  (keyof T & string) | `-${keyof T & string}`;

export type CollectionQuery<T extends object> = {
  filter?: CollectionFilter<T>;
  sort?: CollectionSort<T>[];
  limit?: number;
  offset?: number;
};

export type CollectionMutation<T extends object> = {
  filter: CollectionFilter<T>;
  values: Partial<T>;
};

export type RepositoryOptions = {
  connection?: DatabaseConnection;
};

export interface CollectionRepository<T extends object> {
  findOne(
    query?: CollectionQuery<T>,
    options?: RepositoryOptions,
  ): Promise<T | null>;
  find(query?: CollectionQuery<T>, options?: RepositoryOptions): Promise<T[]>;
  create(
    input: { values: Partial<T> },
    options?: RepositoryOptions,
  ): Promise<T>;
  create(
    input: { values: Partial<T>[] },
    options?: RepositoryOptions,
  ): Promise<T[]>;
  update(
    input: CollectionMutation<T>,
    options?: RepositoryOptions,
  ): Promise<number>;
  destroy(
    input: { filter: CollectionFilter<T> },
    options?: RepositoryOptions,
  ): Promise<number>;
  count(
    query?: Pick<CollectionQuery<T>, 'filter'>,
    options?: RepositoryOptions,
  ): Promise<number>;
}
