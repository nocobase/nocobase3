import { QueueKeys } from 'bullmq';
import { InMemoryQueueStore } from './store.js';

interface MemoryBackendState {
  store: InMemoryQueueStore;
  records: Map<string, JobJson>;
  metadata: Map<string, string | number>;
}

import type {
  IQueueBackend,
  JobJson,
  JobState,
  JobType,
  KeepJobs,
  KeysMap,
  MinimalJob,
  MoveToDelayedOpts,
  ParentKeyOpts,
  RetryJobOpts,
} from 'bullmq';

import { InMemoryBackendBoundary } from './unsupported.js';
import type { BackendFactory } from 'bullmq';

export class InMemoryQueueBackend extends InMemoryBackendBoundary {
  closing: Promise<void> | undefined;
  readonly minimumBlockTimeout: number = 0.001;
  readonly maximumBlockTimeout: number = 10;
  readonly keys: KeysMap;
  readonly qualifiedName: string;
  private displayName: string;

  constructor(
    private readonly state: MemoryBackendState,
    private readonly name: string,
    private readonly prefix: string,
  ) {
    super();
    const keys = new QueueKeys(prefix);
    this.qualifiedName = keys.getQueueQualifiedName(name);
    this.keys = keys.getKeys(name);
    this.displayName = name;
  }

  async waitUntilReady(): Promise<void> {
    if (this.closing) throw new Error('Memory backend is closed');
  }
  close(_force?: boolean): Promise<void> {
    if (!this.closing) {
      this.closing = Promise.resolve();
      this.emit('close');
    }
    return this.closing;
  }
  async disconnect(): Promise<void> {
    await this.close();
  }
  async setName(name: string): Promise<void> {
    this.displayName = name;
  }
  toKey(type: string): string {
    return new QueueKeys(this.prefix).toKey(this.name, type);
  }
  clientName(suffix: string = ''): string {
    return `${this.displayName}${suffix}`;
  }

  async addJob(
    job: JobJson,
    jobId: string,
    _parentKeyOpts?: ParentKeyOpts,
  ): Promise<string> {
    await this.waitUntilReady();
    const data: unknown = JSON.parse(job.data);
    const record = this.state.store.add({
      id: jobId || undefined,
      name: job.name,
      data,
      options: job.opts,
    });
    if (!this.state.records.has(record.id))
      this.state.records.set(
        record.id,
        structuredClone({ ...job, id: record.id, data: record.data }),
      );
    return record.id;
  }
  async addJobs(
    _entries: {
      job: JobJson;
      jobId: string;
      parentKeyOpts?: ParentKeyOpts;
    }[],
  ): Promise<string[]> {
    throw new Error('Memory backend operation is not implemented');
  }
  async moveToActive(
    _token: string,
    _name?: string,
  ): ReturnType<IQueueBackend['moveToActive']> {
    throw new Error('Memory backend operation is not implemented');
  }
  async moveToCompleted<
    T = MinimalJob['data'],
    R = MinimalJob['returnvalue'],
    N extends string = string,
  >(
    _job: MinimalJob<T, R, N>,
    _returnValue: R,
    _removeOnComplete: boolean | number | KeepJobs,
    _token: string,
    _fetchNext: boolean,
  ): ReturnType<IQueueBackend['moveToCompleted']> {
    throw new Error('Memory backend operation is not implemented');
  }
  async moveToFailed<
    T = MinimalJob['data'],
    R = MinimalJob['returnvalue'],
    N extends string = string,
  >(
    _job: MinimalJob<T, R, N>,
    _failedReason: string,
    _removeOnFail: boolean | number | KeepJobs,
    _token: string,
    _fetchNext: boolean,
    _fieldsToUpdate?: NonNullable<RetryJobOpts['fieldsToUpdate']>,
  ): ReturnType<IQueueBackend['moveToFailed']> {
    throw new Error('Memory backend operation is not implemented');
  }
  async moveToDelayed(
    _jobId: string,
    _timestamp: number,
    _delay: number,
    _token?: string,
    _opts?: MoveToDelayedOpts,
  ): ReturnType<IQueueBackend['moveToDelayed']> {
    throw new Error('Memory backend operation is not implemented');
  }
  async moveJobFromActiveToWait(
    _jobId: string,
    _token?: string,
  ): Promise<number> {
    throw new Error('Memory backend operation is not implemented');
  }
  async retryJob(
    _jobId: string,
    _lifo: boolean,
    _token?: string,
    _opts?: RetryJobOpts,
  ): Promise<void> {
    throw new Error('Memory backend operation is not implemented');
  }
  async moveStalledJobsToWait(): Promise<string[]> {
    throw new Error('Memory backend operation is not implemented');
  }
  async drain(_delayed: boolean): Promise<void> {
    throw new Error('Memory backend operation is not implemented');
  }
  async extendLocks(
    _jobIds: string[],
    _tokens: string[],
    _duration: number,
  ): Promise<string[]> {
    throw new Error('Memory backend operation is not implemented');
  }
  async getState(jobId: string): Promise<JobState | 'unknown'> {
    return this.state.store.get(jobId)?.state ?? 'unknown';
  }
  async isJobInState(state: string, jobId: string): Promise<boolean> {
    return (await this.getState(jobId)) === state;
  }
  async getJobData(jobId: string): Promise<JobJson | undefined> {
    const job = this.state.records.get(jobId);
    return job === undefined ? undefined : structuredClone(job);
  }
  async getCounts(types: JobType[]): Promise<number[]> {
    return types.map((type) => {
      const state = type === 'wait' ? 'waiting' : type;
      return [...this.state.records.keys()].filter(
        (id) => this.state.store.get(id)?.state === state,
      ).length;
    });
  }
  async getRanges(
    _types: JobType[],
    _start?: number,
    _end?: number,
    _asc?: boolean,
  ): Promise<[string][]> {
    throw new Error('Memory backend operation is not implemented');
  }
  async setQueueMeta(values: Record<string, string | number>): Promise<number> {
    let added = 0;
    for (const [key, value] of Object.entries(values)) {
      if (!this.state.metadata.has(key)) added++;
      this.state.metadata.set(key, value);
    }
    return added;
  }
  async removeQueueMetaFields(fields: string[]): Promise<number> {
    return fields.reduce(
      (total, field) => total + Number(this.state.metadata.delete(field)),
      0,
    );
  }
  async waitForJob(
    _blockTimeout: number,
  ): ReturnType<IQueueBackend['waitForJob']> {
    throw new Error('Memory backend operation is not implemented');
  }
  async disconnectBlocking(_wait?: boolean): Promise<void> {
    throw new Error('Memory backend operation is not implemented');
  }
  async reconnectBlocking(): Promise<void> {
    throw new Error('Memory backend operation is not implemented');
  }
}

export function createInMemoryBackendFactory(): BackendFactory {
  const states = new Map<string, MemoryBackendState>();
  return (name, options): InMemoryQueueBackend => {
    const prefix =
      'prefix' in options && typeof options.prefix === 'string'
        ? options.prefix
        : 'bull';
    const key = JSON.stringify([prefix, name]);
    let state = states.get(key);
    if (!state) {
      state = {
        store: new InMemoryQueueStore(),
        records: new Map(),
        metadata: new Map(),
      };
      states.set(key, state);
    }
    return new InMemoryQueueBackend(state, name, prefix);
  };
}
