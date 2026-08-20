import bloomFilters from 'bloom-filters';
import type { BloomFilter, BloomFilterOptions } from './types.js';
import { assertNamespace } from './internal/validation.js';

const { BloomFilter: BloomFilterImpl } = bloomFilters;
type BloomFilterInstance = InstanceType<typeof BloomFilterImpl>;

interface FilterEntry {
  filter: BloomFilterInstance;
  options: BloomFilterOptions;
}

export class MemoryBloomFilter implements BloomFilter {
  readonly namespace: string;
  private readonly filters = new Map<string, FilterEntry>();

  constructor(namespace: string) {
    assertNamespace(namespace);
    this.namespace = namespace;
  }

  async reserve(key: string, options: BloomFilterOptions): Promise<void> {
    if (!Number.isSafeInteger(options.capacity) || options.capacity < 1) {
      throw new Error('Bloom filter capacity must be a positive integer.');
    }
    if (!Number.isFinite(options.errorRate) || options.errorRate <= 0 || options.errorRate >= 1) {
      throw new Error('Bloom filter errorRate must be greater than 0 and less than 1.');
    }

    const existing = this.filters.get(key);
    if (existing) {
      if (
        existing.options.capacity !== options.capacity
        || existing.options.errorRate !== options.errorRate
      ) {
        throw new Error(`Bloom filter "${key}" is already reserved with different options.`);
      }
      return;
    }

    this.filters.set(key, {
      filter: BloomFilterImpl.create(options.capacity, options.errorRate),
      options: { ...options },
    });
  }

  async add(key: string, value: string): Promise<void> {
    this.getFilter(key).add(value);
  }

  async addMany(key: string, values: string[]): Promise<void> {
    const filter = this.getFilter(key);
    for (const value of values) {
      filter.add(value);
    }
  }

  async has(key: string, value: string): Promise<boolean> {
    return this.getFilter(key).has(value);
  }

  async delete(key: string): Promise<void> {
    this.filters.delete(key);
  }

  clear(): void {
    this.filters.clear();
  }

  private getFilter(key: string): BloomFilterInstance {
    const entry = this.filters.get(key);
    if (!entry) {
      throw new Error(`Bloom filter "${key}" has not been reserved.`);
    }
    return entry.filter;
  }
}
