import { randomUUID } from 'node:crypto';
import type {
  DatabaseConnection,
  DeleteQuery,
  QueryAdapter,
  Row,
  SelectQuery,
  UpdateQuery,
} from '@nocobase/db';
import type {
  CollectionMutation,
  CollectionQuery,
  CollectionRepository,
  RepositoryOptions,
} from '@nocobase/ai-employee';

const BIGINT_TIMESTAMP_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  aiToolMessages: new Set(['invokeStartTime', 'invokeEndTime']),
  aiUsageEvents: new Set(['occurredAt']),
};

function queryOf(
  connection: DatabaseConnection,
  options?: RepositoryOptions,
): QueryAdapter {
  return options?.connection?.query ?? connection.query;
}
function applyFilter<Q extends SelectQuery | UpdateQuery | DeleteQuery>(
  query: Q,
  filter: Record<string, unknown> = {},
): Q {
  let current: SelectQuery | UpdateQuery | DeleteQuery = query;
  for (const [field, raw] of Object.entries(filter)) {
    if (
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      Object.keys(raw).some((key) =>
        ['$in', '$notIn', '$ne', '$lt', '$lte', '$gt', '$gte'].includes(key),
      )
    ) {
      for (const [operator, value] of Object.entries(
        raw as Record<string, unknown>,
      )) {
        const op =
          operator === '$in'
            ? 'in'
            : operator === '$notIn'
              ? 'not in'
              : operator === '$ne'
                ? '!='
                : operator === '$lt'
                  ? '<'
                  : operator === '$lte'
                    ? '<='
                    : operator === '$gt'
                      ? '>'
                      : operator === '$gte'
                        ? '>='
                        : '=';
        current = current.where(field, op, value);
      }
    } else current = current.where(field, Array.isArray(raw) ? 'in' : '=', raw);
  }
  return current as Q;
}

export class BaseCollectionRepository<
  T extends object,
> implements CollectionRepository<T> {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly table: string,
    private readonly generateId: () => string | number | bigint = randomUUID,
    private readonly jsonFields: ReadonlySet<string> = new Set(),
  ) {}
  async findOne(
    query: CollectionQuery<T> = {},
    options?: RepositoryOptions,
  ): Promise<T | null> {
    return (await this.find({ ...query, limit: 1 }, options))[0] ?? null;
  }
  async find(
    query: CollectionQuery<T> = {},
    options?: RepositoryOptions,
  ): Promise<T[]> {
    let statement = applyFilter(
      queryOf(this.connection, options).selectFrom(this.table).selectAll(),
      query.filter as Record<string, unknown>,
    );
    for (const sort of query.sort ?? [])
      statement = statement.orderBy(
        sort.startsWith('-') ? sort.slice(1) : sort,
        sort.startsWith('-') ? 'desc' : 'asc',
      );
    if (query.limit !== undefined) statement = statement.limit(query.limit);
    if (query.offset !== undefined) statement = statement.offset(query.offset);
    return (await statement.execute<T>()).map((row) => this.decodeRow(row));
  }
  create(
    input: { values: Partial<T> },
    options?: RepositoryOptions,
  ): Promise<T>;
  create(
    input: { values: Partial<T>[] },
    options?: RepositoryOptions,
  ): Promise<T[]>;
  async create(
    input: {
      values: Partial<T> | Partial<T>[];
    },
    options?: RepositoryOptions,
  ): Promise<T | T[]> {
    const values = Array.isArray(input.values)
      ? input.values.map((value) => this.normalizeInsert(value))
      : this.normalizeInsert(input.values);
    await queryOf(this.connection, options)
      .insertInto(this.table)
      .values(
        (Array.isArray(values)
          ? values.map((value) => this.encodeRow(value))
          : this.encodeRow(values)) as Row | Row[],
      )
      .execute();
    return values;
  }
  async update(
    input: CollectionMutation<T>,
    options?: RepositoryOptions,
  ): Promise<number> {
    const connection = options?.connection;
    let statement = applyFilter(
      queryOf(this.connection, { connection })
        .updateTable(this.table)
        .set(this.encodeRow(input.values) as Row),
      input.filter as Record<string, unknown>,
    );
    return (await statement.execute()).updatedCount ?? 0;
  }
  async destroy(
    input: { filter: CollectionQuery<T>['filter'] },
    options?: RepositoryOptions,
  ): Promise<number> {
    const connection = options?.connection;
    let statement = applyFilter(
      queryOf(this.connection, { connection }).deleteFrom(this.table),
      input.filter as Record<string, unknown>,
    );
    return (await statement.execute()).deletedCount ?? 0;
  }
  async count(
    query: Pick<CollectionQuery<T>, 'filter'> = {},
    options?: RepositoryOptions,
  ): Promise<number> {
    const statement = applyFilter(
      queryOf(this.connection, options)
        .selectFrom(this.table)
        .select((eb) => [eb.fn.countAll<number>().as('count')]),
      query.filter as Record<string, unknown>,
    );
    const row = await statement.executeTakeFirst<{
      count: number | string | bigint;
    }>();
    return Number(row?.count ?? 0);
  }
  private normalizeInsert(value: Partial<T>): T {
    const now = new Date();
    const normalized: Record<string, unknown> = { ...value };
    if (this.table === 'aiConversations' && normalized.sessionId == null)
      normalized.sessionId = randomUUID();
    if (
      ['aiMessages', 'aiToolMessages'].includes(this.table) &&
      normalized[this.table === 'aiMessages' ? 'messageId' : 'id'] == null
    )
      normalized[this.table === 'aiMessages' ? 'messageId' : 'id'] =
        this.generateId();
    if (
      this.table !== 'aiUsageEvents' &&
      !this.table.startsWith('lcCheckpoint')
    ) {
      normalized.createdAt ??= now;
      normalized.updatedAt ??= now;
    }
    return normalized as T;
  }
  private encodeRow(value: Partial<T>): Partial<T> {
    const encoded: Record<string, unknown> = { ...value };
    for (const field of this.jsonFields) {
      const fieldValue = encoded[field];
      if (fieldValue != null) {
        encoded[field] = JSON.stringify(fieldValue);
      }
    }
    for (const field of BIGINT_TIMESTAMP_FIELDS[this.table] ?? []) {
      const fieldValue = encoded[field];
      if (fieldValue instanceof Date) {
        encoded[field] = fieldValue.getTime();
      } else if (
        typeof fieldValue === 'string' &&
        !/^-?\d+$/.test(fieldValue)
      ) {
        const timestamp = Date.parse(fieldValue);
        if (!Number.isFinite(timestamp)) {
          throw new TypeError(
            `Invalid bigint timestamp for ${this.table}.${field}: ${fieldValue}`,
          );
        }
        encoded[field] = timestamp;
      }
    }
    return encoded as Partial<T>;
  }
  private decodeRow(value: T): T {
    const decoded = { ...value } as Record<string, unknown>;
    for (const field of this.jsonFields) {
      const fieldValue = decoded[field];
      if (typeof fieldValue !== 'string') continue;
      try {
        decoded[field] = JSON.parse(fieldValue);
      } catch {
        // Preserve invalid legacy values rather than making the record unreadable.
      }
    }
    return decoded as T;
  }
}
