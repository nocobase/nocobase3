import type { JsonRecord } from '../internal-types.js';
import type { TableRepository } from '../repositories/table-repository.js';

export interface PageOptions {
  readonly page: number;
  readonly pageSize: number;
  readonly paginate: boolean;
}

export interface PageResult<T> {
  readonly data: T[];
  readonly meta: { count: number; page: number; pageSize: number };
}

export async function page<T extends Record<string, unknown>>(options: {
  readonly repository: TableRepository<T>;
  readonly paging: PageOptions;
  readonly filter?: JsonRecord;
  readonly transform?: (record: T) => T | JsonRecord;
}): Promise<PageResult<T | JsonRecord>> {
  const filter = options.filter ?? {};
  const rows = await options.repository.find({
    filter,
    sort: ['-createdAt'],
    ...(options.paging.paginate
      ? {
          limit: options.paging.pageSize,
          offset: (options.paging.page - 1) * options.paging.pageSize,
        }
      : {}),
  });
  return {
    data: options.transform ? rows.map(options.transform) : rows,
    meta: {
      count: await options.repository.count(filter),
      page: options.paging.page,
      pageSize: options.paging.pageSize,
    },
  };
}
