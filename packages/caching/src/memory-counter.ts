import { CacheableMemory } from '@cacheable/memory';
import type { Counter } from './types.js';
import { assertNamespace, assertTtl } from './internal/validation.js';

interface CounterEntry {
  value: number;
}

export interface MemoryCounterOptions {
  namespace: string;
  maxSize: number;
}

export class MemoryCounter implements Counter {
  readonly namespace: string;
  private readonly store: CacheableMemory;

  constructor(options: MemoryCounterOptions) {
    assertNamespace(options.namespace);
    this.namespace = options.namespace;
    this.store = new CacheableMemory({
      lruSize: options.maxSize,
      useClone: false,
    });
  }

  async get(key: string): Promise<number> {
    return (this.store.get(key) as CounterEntry | undefined)?.value ?? 0;
  }

  async increment(key: string, amount = 1, ttl?: number): Promise<number> {
    if (!Number.isFinite(amount)) throw new Error('Counter amount must be a finite number.');
    assertTtl(ttl);

    const current = this.store.get(key) as CounterEntry | undefined;
    if (current) {
      current.value += amount;
      return current.value;
    }

    const entry = { value: amount };
    this.store.set(key, entry, ttl);
    return entry.value;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
