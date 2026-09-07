import type { TableRepository } from '../repository/table-repository.js';

export interface PageOptions {
  readonly page: number;
  readonly pageSize: number;
  readonly paginate: boolean;
}

export interface PageResult<T> {
  readonly data: T[];
  readonly meta: { count: number; page: number; pageSize: number };
}

type PageBaseOptions<T extends object> = {
  readonly repository: TableRepository<T>;
  readonly paging: PageOptions;
  readonly filter?: Record<string, unknown>;
};

export function page<T extends object>(
  options: PageBaseOptions<T> & { readonly transform?: undefined },
): Promise<PageResult<T>>;
export function page<T extends object, R extends object>(
  options: PageBaseOptions<T> & { readonly transform: (record: T) => R },
): Promise<PageResult<R>>;
export async function page<T extends object, R extends object>(
  options: PageBaseOptions<T> & {
    readonly transform?: (record: T) => R;
  },
): Promise<PageResult<T | R>> {
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
