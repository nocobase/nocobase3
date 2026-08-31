import type {
  DatabaseConnection,
  Row,
  SelectQuery,
} from '@nocobase/app-database';

const JSON_FIELDS: Record<string, readonly string[]> = {
  aiKnowledgeBase: ['vectorStoreProps', 'segmentOptions'],
  aiKnowledgeBaseDocs: ['meta', 'segmentOptions'],
  aiKnowledgeBaseDocSegments: ['meta'],
  aiKnowledgeBaseDocSegmentShards: ['meta'],
  aiVectorDatabases: ['connectProps'],
};

export type Filter = Record<string, unknown>;

function applyFilter(query: SelectQuery, filter: Filter): SelectQuery {
  let result = query;
  for (const [field, value] of Object.entries(filter)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const input = value as Record<string, unknown>;
      if ('$in' in input) {
        result = result.where(field, 'in', input.$in as readonly unknown[]);
        continue;
      }
    }
    result = result.where(field, Array.isArray(value) ? 'in' : '=', value);
  }
  return result;
}

export class TableRepository<T extends Record<string, unknown>> {
  constructor(
    private readonly database: DatabaseConnection,
    readonly table: string,
  ) {}

  async find(
    options: {
      filter?: Filter;
      sort?: string[];
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<T[]> {
    let query = applyFilter(
      this.database.query.selectFrom(this.table).selectAll(),
      options.filter ?? {},
    );
    for (const sort of options.sort ?? []) {
      query = query.orderBy(
        sort.startsWith('-') ? sort.slice(1) : sort,
        sort.startsWith('-') ? 'desc' : 'asc',
      );
    }
    if (options.limit !== undefined) query = query.limit(options.limit);
    if (options.offset !== undefined) query = query.offset(options.offset);
    return (await query.execute<T>()).map((row) => this.decode(row));
  }

  async findOne(filter: Filter): Promise<T | null> {
    return (await this.find({ filter, limit: 1 }))[0] ?? null;
  }

  async findById(id: string | number): Promise<T | null> {
    return this.findOne({ id });
  }

  async count(filter: Filter = {}): Promise<number> {
    const query = applyFilter(
      this.database.query
        .selectFrom(this.table)
        .select((eb) => [eb.fn.countAll<number>().as('count')]),
      filter,
    );
    const row = await query.executeTakeFirst<{
      count: number | string | bigint;
    }>();
    return Number(row?.count ?? 0);
  }

  async create(values: Partial<T>, lookupFilter?: Filter): Promise<T> {
    const now = new Date();
    const input = this.encode({ createdAt: now, updatedAt: now, ...values });
    const result = await this.database.query
      .insertInto(this.table)
      .values(input)
      .execute();
    const returnedId =
      result.rows?.[0]?.id ??
      (result.insertId &&
      typeof result.insertId === 'object' &&
      'id' in result.insertId
        ? (result.insertId as { id?: unknown }).id
        : result.insertId);
    if (typeof returnedId === 'string' || typeof returnedId === 'number') {
      const created = await this.findById(returnedId);
      if (created) return created;
    }
    if (lookupFilter) {
      const created = await this.findOne(lookupFilter);
      if (created) return created;
      throw new Error(`Inserted ${this.table} row could not be read back`);
    }
    const unique = ['key', 'uid'].find((field) => input[field] !== undefined);
    if (unique) {
      const created = await this.findOne({ [unique]: input[unique] });
      if (created) return created;
    }
    return this.decode(input as T);
  }

  async createMany(values: Array<Partial<T>>): Promise<void> {
    if (!values.length) return;
    const now = new Date();
    await this.database.query
      .insertInto(this.table)
      .values(
        values.map(
          (value) =>
            this.encode({ createdAt: now, updatedAt: now, ...value }) as Row,
        ),
      )
      .execute();
  }

  async update(filter: Filter, values: Partial<T>): Promise<number> {
    let query = this.database.query
      .updateTable(this.table)
      .set(this.encode({ ...values, updatedAt: new Date() }));
    for (const [field, value] of Object.entries(filter)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        '$in' in (value as Record<string, unknown>)
      ) {
        query = query.where(
          field,
          'in',
          (value as { $in: readonly unknown[] }).$in,
        );
      } else {
        query = query.where(field, Array.isArray(value) ? 'in' : '=', value);
      }
    }
    return (await query.execute()).updatedCount ?? 0;
  }

  async destroy(filter: Filter): Promise<number> {
    let query = this.database.query.deleteFrom(this.table);
    for (const [field, value] of Object.entries(filter)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        '$in' in (value as Record<string, unknown>)
      ) {
        query = query.where(
          field,
          'in',
          (value as { $in: readonly unknown[] }).$in,
        );
      } else {
        query = query.where(field, Array.isArray(value) ? 'in' : '=', value);
      }
    }
    return (await query.execute()).deletedCount ?? 0;
  }

  private encode(value: Record<string, unknown>): Record<string, unknown> {
    const encoded = { ...value };
    for (const field of JSON_FIELDS[this.table] ?? []) {
      if (
        encoded[field] !== undefined &&
        encoded[field] !== null &&
        typeof encoded[field] !== 'string'
      ) {
        encoded[field] = JSON.stringify(encoded[field]);
      }
    }
    return encoded;
  }

  private decode(value: T): T {
    const decoded = { ...value } as Record<string, unknown>;
    for (const field of JSON_FIELDS[this.table] ?? []) {
      if (typeof decoded[field] === 'string') {
        try {
          decoded[field] = JSON.parse(decoded[field]);
        } catch {
          // Preserve malformed legacy data for diagnostics.
        }
      }
    }
    return decoded as T;
  }
}
