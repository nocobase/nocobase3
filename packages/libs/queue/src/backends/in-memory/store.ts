import type { JobsOptions } from 'bullmq';

export type MemoryJobState =
  'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
export interface MemoryJobInput {
  id?: string;
  name: string;
  data: unknown;
  options?: JobsOptions;
}
export interface MemoryJobRecord {
  id: string;
  name: string;
  data: string;
  options: JobsOptions;
  state: MemoryJobState;
  timestamp: number;
}

export class InMemoryQueueStore {
  private readonly jobs: Map<string, MemoryJobRecord> = new Map();
  private sequence: bigint = 0n;

  add(input: MemoryJobInput): MemoryJobRecord {
    const data = JSON.stringify(input.data === undefined ? {} : input.data);
    if (data === undefined)
      throw new TypeError('Job data must serialize to JSON text');
    const options = structuredClone(input.options ?? {});
    if (input.id !== undefined) {
      const existing = this.jobs.get(input.id);
      if (existing) return structuredClone(existing);
    }
    let id = input.id;
    if (id === undefined) {
      do {
        id = String(++this.sequence);
      } while (this.jobs.has(id));
    }
    const record: MemoryJobRecord = {
      id,
      name: input.name,
      data,
      options,
      state: 'waiting',
      timestamp: Date.now(),
    };
    this.jobs.set(id, record);
    return structuredClone(record);
  }

  get(id: string): MemoryJobRecord | undefined {
    const record = this.jobs.get(id);
    return record === undefined ? undefined : structuredClone(record);
  }

  transition(
    id: string,
    expected: MemoryJobState,
    next: MemoryJobState,
  ): boolean {
    const record = this.jobs.get(id);
    if (!record || record.state !== expected) return false;
    record.state = next;
    return true;
  }
}

export function createInMemoryStoreRegistry(): (
  identity: string,
) => InMemoryQueueStore {
  const stores = new Map<string, InMemoryQueueStore>();
  return (identity): InMemoryQueueStore => {
    const existing = stores.get(identity);
    if (existing) return existing;
    const store = new InMemoryQueueStore();
    stores.set(identity, store);
    return store;
  };
}
