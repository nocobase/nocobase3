import type {
  CollectionQuery,
  CollectionRepository,
  AIEmployeeEntity,
  LLMServiceEntity,
  MCPEntity,
  ToolsEntity,
  ToolsQuery,
  ToolsRepository,
} from '../app/repository/index.js';

function matches<T extends Record<string, any>>(
  value: T,
  filter: Record<string, any> = {},
): boolean {
  return Object.entries(filter).every(
    ([field, expected]) => value[field] === expected,
  );
}

class TestCollectionRepository<
  T extends Record<string, any>,
> implements CollectionRepository<T> {
  protected readonly values: T[] = [];

  async findOne(query: CollectionQuery<T> = {}): Promise<T | null> {
    return (await this.find({ ...query, limit: 1 }))[0] ?? null;
  }

  async find(query: CollectionQuery<T> = {}): Promise<T[]> {
    let values = this.values.filter((value) => matches(value, query.filter));
    for (const sort of [...(query.sort ?? [])].reverse()) {
      const descending = sort.startsWith('-');
      const field = descending ? sort.slice(1) : sort;
      values = values.toSorted((a, b) => {
        const result = String(a[field] ?? '').localeCompare(
          String(b[field] ?? ''),
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
    filter: Record<string, any>;
    values: Partial<T>;
  }): Promise<number> {
    const updated: T[] = [];
    this.values.forEach((value, index) => {
      if (!matches(value, input.filter)) return;
      const next = { ...value, ...input.values };
      this.values[index] = next;
      updated.push(next);
    });
    return updated.length;
  }

  async destroy(input: { filter?: Record<string, any> } = {}): Promise<number> {
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

export class TestAIEmployeeRepository extends TestCollectionRepository<AIEmployeeEntity> {}
export class TestMCPRepository extends TestCollectionRepository<MCPEntity> {}
export class TestLLMServiceRepository extends TestCollectionRepository<LLMServiceEntity> {}

class KeyedMap<T extends Record<string, any>> {
  protected readonly values = new Map<string, T>();
  constructor(private readonly keyOf: (value: T) => string) {}
  protected create(value: T): T {
    this.values.set(this.keyOf(value), value);
    return value;
  }
  protected update(key: string, value: Partial<T>): T | undefined {
    const current = this.values.get(key);
    if (!current) return undefined;
    const next = { ...current, ...value } as T;
    this.values.set(key, next);
    return next;
  }
  protected delete(key: string): void {
    this.values.delete(key);
  }
  protected get(key: string): T | undefined {
    return this.values.get(key);
  }
  protected list(): T[] {
    return [...this.values.values()];
  }
  protected createOrUpdate(value: T): { value: T; replaced: boolean } {
    const key = this.keyOf(value);
    const replaced = this.values.has(key);
    this.values.set(key, value);
    return { value, replaced };
  }
}

export class TestToolsRepository
  extends KeyedMap<ToolsEntity>
  implements ToolsRepository
{
  constructor() {
    super((value) => value.definition.name);
  }
  createTools({ value }: { value: ToolsEntity }) {
    return Promise.resolve(this.create(value));
  }
  updateTools({ name, value }: { name: string; value: Partial<ToolsEntity> }) {
    return Promise.resolve(this.update(name, value));
  }
  deleteTools(name: string) {
    this.delete(name);
    return Promise.resolve();
  }
  getTools(name: string) {
    return Promise.resolve(this.get(name));
  }
  listTools(query: ToolsQuery = {}) {
    return Promise.resolve(
      this.list().filter(
        (value) =>
          (!query.scope || value.scope === query.scope) &&
          (!query.defaultPermission ||
            value.defaultPermission === query.defaultPermission) &&
          (query.silence == null || value.silence === query.silence),
      ),
    );
  }
  createOrUpdateTools({ value }: { value: ToolsEntity }) {
    return Promise.resolve(this.createOrUpdate(value));
  }
}
