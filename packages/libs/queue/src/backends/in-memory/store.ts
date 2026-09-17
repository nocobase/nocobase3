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
  add(_input: MemoryJobInput): MemoryJobRecord {
    throw new Error('Memory storage is not implemented');
  }
  get(_id: string): MemoryJobRecord | undefined {
    throw new Error('Memory storage is not implemented');
  }
  transition(
    _id: string,
    _expected: MemoryJobState,
    _next: MemoryJobState,
  ): boolean {
    throw new Error('Memory storage is not implemented');
  }
}

export function createInMemoryStoreRegistry(): (
  identity: string,
) => InMemoryQueueStore {
  throw new Error('Memory storage registry is not implemented');
}
