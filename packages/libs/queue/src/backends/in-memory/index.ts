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
  async waitUntilReady(): Promise<void> {
    throw new Error('Memory backend operation is not implemented');
  }
  async close(_force?: boolean): Promise<void> {
    throw new Error('Memory backend operation is not implemented');
  }
  readonly closing: Promise<void> | undefined = undefined;
  async disconnect(): Promise<void> {
    throw new Error('Memory backend operation is not implemented');
  }
  async setName(_name: string): Promise<void> {
    throw new Error('Memory backend operation is not implemented');
  }
  readonly minimumBlockTimeout: number = 0;
  readonly maximumBlockTimeout?: number = undefined;
  readonly qualifiedName: string = '';
  readonly keys: KeysMap = {};
  toKey(_type: string): string {
    throw new Error('Memory backend operation is not implemented');
  }
  clientName(_suffix?: string): string {
    throw new Error('Memory backend operation is not implemented');
  }
  async addJob(
    _job: JobJson,
    _jobId: string,
    _parentKeyOpts?: ParentKeyOpts,
  ): Promise<string> {
    throw new Error('Memory backend operation is not implemented');
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
  async getState(_jobId: string): Promise<JobState | 'unknown'> {
    throw new Error('Memory backend operation is not implemented');
  }
  async isJobInState(_state: string, _jobId: string): Promise<boolean> {
    throw new Error('Memory backend operation is not implemented');
  }
  async getJobData(_jobId: string): Promise<JobJson | undefined> {
    throw new Error('Memory backend operation is not implemented');
  }
  async getCounts(_types: JobType[]): Promise<number[]> {
    throw new Error('Memory backend operation is not implemented');
  }
  async getRanges(
    _types: JobType[],
    _start?: number,
    _end?: number,
    _asc?: boolean,
  ): Promise<[string][]> {
    throw new Error('Memory backend operation is not implemented');
  }
  async setQueueMeta(
    _values: Record<string, string | number>,
  ): Promise<number> {
    throw new Error('Memory backend operation is not implemented');
  }
  async removeQueueMetaFields(_fields: string[]): Promise<number> {
    throw new Error('Memory backend operation is not implemented');
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
  return () => new InMemoryQueueBackend();
}
