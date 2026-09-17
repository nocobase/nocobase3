import { QueueKeys } from 'bullmq';
import { InMemoryQueueStore } from './store.js';
import { prepareMemoryBatch } from './bulk.js';
import { assertSupportedJob } from './guards.js';
import { MemoryWaiter, MemoryWorkerState } from './worker.js';

interface MemoryBackendState {
  store: InMemoryQueueStore;
  records: Map<string, JobJson>;
  metadata: Map<string, string | number>;
  worker: MemoryWorkerState;
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
  private readonly waiter: MemoryWaiter;

  constructor(
    private readonly state: MemoryBackendState,
    private readonly name: string,
    private readonly prefix: string,
    private readonly lockDuration: number = 30000,
    private readonly stalledInterval: number = 30000,
    private readonly maxStalledCount: number = 1,
  ) {
    super();
    const keys = new QueueKeys(prefix);
    this.qualifiedName = keys.getQueueQualifiedName(name);
    this.keys = keys.getKeys(name);
    this.displayName = name;
    this.waiter = new MemoryWaiter(state.worker);
  }

  async waitUntilReady(): Promise<void> {
    if (this.closing) throw new Error('Memory backend is closed');
  }
  close(_force?: boolean): Promise<void> {
    if (!this.closing) {
      this.closing = Promise.resolve();
      this.waiter.disconnect();
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
    parentKeyOpts?: ParentKeyOpts,
  ): Promise<string> {
    await this.waitUntilReady();
    assertSupportedJob(job, parentKeyOpts);
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
    this.state.worker.notify();
    return record.id;
  }
  async addJobs(
    entries: { job: JobJson; jobId: string; parentKeyOpts?: ParentKeyOpts }[],
  ): Promise<string[]> {
    await this.waitUntilReady();
    const prepared = prepareMemoryBatch(entries);
    const records = this.state.store.addMany(
      prepared.map((entry) => entry.input),
    );
    for (const [index, record] of records.entries()) {
      const entry = prepared[index];
      if (entry && !this.state.records.has(record.id)) {
        this.state.records.set(record.id, {
          ...entry.job,
          id: record.id,
          data: record.data,
        });
      }
    }
    this.state.worker.notify();
    return records.map((record) => record.id);
  }
  private waitingId(): string | undefined {
    let selected: string | undefined;
    let priority = Infinity;
    for (const id of this.state.records.keys()) {
      const record = this.state.store.get(id);
      if (record?.state !== 'waiting') continue;
      const candidate = record.options.priority ?? 0;
      if (candidate < priority) {
        selected = id;
        priority = candidate;
      }
    }
    return selected;
  }

  async moveToActive(
    token: string,
    name?: string,
  ): Promise<[JobJson | null, string | null, number, number]> {
    await this.waitUntilReady();
    return this.claim(token, name);
  }

  private claim(
    token: string,
    name?: string,
  ): [JobJson | null, string | null, number, number] {
    const id = this.waitingId();
    if (id === undefined) return [null, null, 0, 0];
    const job = this.state.records.get(id);
    if (!job || !this.state.store.transition(id, 'waiting', 'active'))
      throw new Error('Inconsistent memory claim');
    this.state.worker.locks.set(id, {
      token,
      expires: Date.now() + this.lockDuration,
    });
    job.processedOn = Date.now();
    job.attemptsStarted = (job.attemptsStarted || 0) + 1;
    if (name !== undefined) job.processedBy = name;
    return [structuredClone(job), id, 0, 0];
  }
  private finish(
    id: string | undefined,
    token: string,
    status: 'completed' | 'failed',
    value: string,
    retention: boolean | number | KeepJobs | undefined,
  ): number {
    if (retention !== undefined && retention !== false)
      throw new Error('Memory retention is not implemented');
    if (id === undefined || !this.state.worker.owns(id, token))
      throw new Error('Invalid or expired lock token');
    const record = this.state.records.get(id);
    if (!record || !this.state.store.transition(id, 'active', status))
      throw new Error('Job is not active');
    const finishedOn = Date.now();
    record.finishedOn = finishedOn;
    record.attemptsMade = (record.attemptsMade || 0) + 1;
    if (status === 'completed') record.returnvalue = value;
    else record.failedReason = value;
    this.state.worker.locks.delete(id);
    return finishedOn;
  }

  async moveToCompleted<
    T = MinimalJob['data'],
    R = MinimalJob['returnvalue'],
    N extends string = string,
  >(
    job: MinimalJob<T, R, N>,
    returnValue: R,
    removeOnComplete: boolean | number | KeepJobs,
    token: string,
    fetchNext: boolean,
  ): ReturnType<IQueueBackend['moveToCompleted']> {
    const value = JSON.stringify(
      returnValue === undefined ? null : returnValue,
    );
    if (value === undefined)
      throw new TypeError('Job result must serialize to JSON');
    const finishedOn = this.finish(
      job.id,
      token,
      'completed',
      value,
      removeOnComplete,
    );
    return {
      finishedOn,
      result: fetchNext && !this.closing ? this.claim(token) : undefined,
    };
  }

  async moveToFailed<
    T = MinimalJob['data'],
    R = MinimalJob['returnvalue'],
    N extends string = string,
  >(
    job: MinimalJob<T, R, N>,
    failedReason: string,
    removeOnFail: boolean | number | KeepJobs,
    token: string,
    fetchNext: boolean,
    fieldsToUpdate?: NonNullable<RetryJobOpts['fieldsToUpdate']>,
  ): ReturnType<IQueueBackend['moveToFailed']> {
    const stacktrace: unknown = fieldsToUpdate?.stacktrace;
    if (stacktrace !== undefined && typeof stacktrace !== 'string')
      throw new TypeError('Invalid job stacktrace');
    const finishedOn = this.finish(
      job.id,
      token,
      'failed',
      failedReason,
      removeOnFail,
    );
    const stored =
      job.id === undefined ? undefined : this.state.records.get(job.id);
    if (stored && typeof stacktrace === 'string')
      stored.stacktrace = stacktrace;
    return {
      finishedOn,
      result: fetchNext && !this.closing ? this.claim(token) : undefined,
    };
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
    jobId: string,
    token?: string,
  ): Promise<number> {
    if (token === undefined || !this.state.worker.owns(jobId, token))
      throw new Error('Invalid or expired lock token');
    if (!this.state.store.transition(jobId, 'active', 'waiting'))
      throw new Error('Job is not active');
    this.state.worker.locks.delete(jobId);
    this.state.worker.notify();
    return 0;
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
    const now = Date.now();
    const shared = this.state.worker;
    if (now < shared.nextStalledCheck) return [];
    shared.nextStalledCheck = now + this.stalledInterval;
    const recovered: string[] = [];
    for (const id of shared.stalled) {
      const lock = shared.locks.get(id);
      if (lock && lock.expires > now) continue;
      const job = this.state.records.get(id);
      if (!job || !this.state.store.transition(id, 'active', 'waiting'))
        continue;
      shared.locks.delete(id);
      job.stalledCounter = (job.stalledCounter || 0) + 1;
      if (job.stalledCounter > this.maxStalledCount)
        job.deferredFailure = 'job stalled more than allowable limit';
      recovered.push(id);
    }
    shared.stalled.clear();
    for (const id of this.state.records.keys()) {
      if (this.state.store.get(id)?.state === 'active') shared.stalled.add(id);
    }
    if (recovered.length) shared.notify();
    return recovered;
  }
  async drain(delayed: boolean): Promise<void> {
    await this.waitUntilReady();
    for (const id of this.state.store.drain(delayed))
      this.state.records.delete(id);
  }
  async extendLocks(
    jobIds: string[],
    tokens: string[],
    duration: number,
  ): Promise<string[]> {
    const failed: string[] = [];
    for (const [index, id] of jobIds.entries()) {
      const token = tokens[index];
      if (token === undefined || !this.state.worker.owns(id, token))
        failed.push(id);
      else {
        this.state.worker.locks.set(id, {
          token,
          expires: Date.now() + duration,
        });
        this.state.worker.stalled.delete(id);
      }
    }
    return failed;
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
    blockTimeout: number,
  ): ReturnType<IQueueBackend['waitForJob']> {
    return this.waiter.wait(blockTimeout, () => this.waitingId());
  }
  async disconnectBlocking(_wait?: boolean): Promise<void> {
    this.waiter.disconnect();
  }
  async reconnectBlocking(): Promise<void> {
    await this.waitUntilReady();
    this.waiter.reconnect();
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
        worker: new MemoryWorkerState(),
      };
      states.set(key, state);
    }
    const lockDuration =
      'lockDuration' in options && typeof options.lockDuration === 'number'
        ? options.lockDuration
        : 30000;
    const stalledInterval =
      'stalledInterval' in options &&
      typeof options.stalledInterval === 'number'
        ? options.stalledInterval
        : 30000;
    const maxStalledCount =
      'maxStalledCount' in options &&
      typeof options.maxStalledCount === 'number'
        ? options.maxStalledCount
        : 1;
    return new InMemoryQueueBackend(
      state,
      name,
      prefix,
      lockDuration,
      stalledInterval,
      maxStalledCount,
    );
  };
}
