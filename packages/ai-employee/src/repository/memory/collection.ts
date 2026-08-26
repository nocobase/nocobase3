import type {
  CollectionQuery,
  CollectionRepository,
  RepositoryOptions,
} from '../collection.js';

function matches<T extends object>(
  value: T,
  filter: Record<string, unknown> = {},
): boolean {
  return Object.entries(filter).every(([field, expected]) => {
    const actual = (value as Record<string, unknown>)[field];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const operators = expected as Record<string, unknown>;
      if ('$in' in operators)
        return (operators.$in as readonly unknown[]).includes(actual);
      if ('$notIn' in operators)
        return !(operators.$notIn as readonly unknown[]).includes(actual);
      if ('$ne' in operators) return actual !== operators.$ne;
      if ('$lt' in operators) return actual < operators.$lt;
      if ('$lte' in operators) return actual <= operators.$lte;
      if ('$gt' in operators) return actual > operators.$gt;
      if ('$gte' in operators) return actual >= operators.$gte;
    }
    return Array.isArray(expected)
      ? expected.includes(actual)
      : actual === expected;
  });
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === 'number' && typeof right === 'number')
    return left - right;
  if (typeof left === 'bigint' && typeof right === 'bigint')
    return left < right ? -1 : 1;
  return String(left).localeCompare(String(right));
}

export class MemoryCollectionRepository<
  T extends object,
> implements CollectionRepository<T> {
  protected readonly values: T[] = [];

  async findOne(query: CollectionQuery<T> = {}): Promise<T | null> {
    return (await this.find({ ...query, limit: 1 }))[0] ?? null;
  }

  async find(query: CollectionQuery<T> = {}): Promise<T[]> {
    let values = this.values.filter((value) =>
      matches(value, query.filter as Record<string, unknown>),
    );
    for (const sort of [...(query.sort ?? [])].reverse()) {
      const descending = sort.startsWith('-');
      const field = descending ? sort.slice(1) : sort;
      values = values.toSorted((left, right) => {
        const result = compareValues(
          (left as Record<string, unknown>)[field],
          (right as Record<string, unknown>)[field],
        );
        return descending ? -result : result;
      });
    }
    return values.slice(
      query.offset ?? 0,
      query.limit == null ? undefined : (query.offset ?? 0) + query.limit,
    );
  }

  create(input: { values: Partial<T> }): Promise<T>;
  create(input: { values: Partial<T>[] }): Promise<T[]>;
  async create(input: { values: Partial<T> | Partial<T>[] }): Promise<T | T[]> {
    const values = (
      Array.isArray(input.values) ? input.values : [input.values]
    ).map((value) => ({ ...value }) as T);
    this.values.push(...values);
    return Array.isArray(input.values) ? values : values[0];
  }

  async update(input: {
    filter: Record<string, unknown>;
    values: Partial<T>;
  }): Promise<number> {
    let count = 0;
    this.values.forEach((value, index) => {
      if (!matches(value, input.filter)) return;
      this.values[index] = { ...value, ...input.values };
      count += 1;
    });
    return count;
  }

  async destroy(
    input: { filter?: Record<string, unknown> } = {},
  ): Promise<number> {
    const retained = this.values.filter(
      (value) => !matches(value, input.filter),
    );
    const count = this.values.length - retained.length;
    this.values.splice(0, this.values.length, ...retained);
    return count;
  }

  async count(query: Pick<CollectionQuery<T>, 'filter'> = {}): Promise<number> {
    return (await this.find(query)).length;
  }
}
