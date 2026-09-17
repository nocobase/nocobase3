import { EventEmitter } from 'node:events';
import type {
  DependenciesOpts,
  FinishedStatus,
  IQueueBackend,
  JobJson,
  JobProgress,
  JobsOptions,
  JobState,
  JobType,
  KeepJobs,
  KeysMap,
  MinimalJob,
  MoveToDelayedOpts,
  MoveToWaitingChildrenOpts,
  ParentKeyOpts,
  RepeatableOptions,
  RetryJobOpts,
  RetryOptions,
  StreamReadRaw,
} from 'bullmq';

/**
 * Partial backend scaffold following the BullMQ 6.3.6 backend audit.
 *
 * All 55 U-* operations fail explicitly; the remaining operations require a
 * concrete implementation. EventEmitter supplies lifecycle subscriptions only.
 * Indexed types preserve upstream contracts, including their generic defaults,
 * without introducing broader payload or result types here.
 */
export abstract class InMemoryBackendBoundary
  extends EventEmitter
  implements IQueueBackend
{
  abstract waitUntilReady(): Promise<void>;

  abstract close(force?: boolean): Promise<void>;

  abstract readonly closing: Promise<void> | undefined;

  abstract disconnect(): Promise<void>;

  abstract setName(name: string): Promise<void>;

  abstract readonly minimumBlockTimeout: number;

  abstract readonly maximumBlockTimeout?: number;

  // U-flow: explicitly unsupported by the in-memory audit.
  forQueue(_queueName: string, _prefix?: string): IQueueBackend {
    throw new Error('Unsupported in-memory queue operation: forQueue');
  }

  abstract readonly qualifiedName: string;

  abstract readonly keys: KeysMap;

  abstract toKey(type: string): string;

  // U-flow: explicitly unsupported by the in-memory audit.
  parseNodeKey(_key: string): ReturnType<IQueueBackend['parseNodeKey']> {
    throw new Error('Unsupported in-memory queue operation: parseNodeKey');
  }

  abstract clientName(suffix?: string): string;

  abstract addJob(
    job: JobJson,
    jobId: string,
    parentKeyOpts?: ParentKeyOpts,
  ): Promise<string>;

  abstract addJobs(
    entries: {
      job: JobJson;
      jobId: string;
      parentKeyOpts?: ParentKeyOpts;
    }[],
  ): Promise<string[]>;

  // U-flow: explicitly unsupported by the in-memory audit.
  async addFlow(
    _entries: {
      jobData: JobJson;
      jobId: string;
      parentKeyOpts: ParentKeyOpts;
      prefix: string;
      queueName: string;
    }[],
  ): Promise<[Error | null, string | number][]> {
    throw new Error('Unsupported in-memory queue operation: addFlow');
  }

  // U-scheduler: explicitly unsupported by the in-memory audit.
  async addJobScheduler(
    _jobSchedulerId: string,
    _nextMillis: number,
    _templateData: string,
    _templateOpts: JobsOptions,
    _opts: RepeatableOptions,
    _delayedJobOpts: JobsOptions,
    _producerId?: string,
  ): Promise<[string, number]> {
    throw new Error('Unsupported in-memory queue operation: addJobScheduler');
  }

  abstract moveToActive(
    token: string,
    name?: string,
  ): ReturnType<IQueueBackend['moveToActive']>;

  abstract moveToCompleted<
    T = MinimalJob['data'],
    R = MinimalJob['returnvalue'],
    N extends string = string,
  >(
    job: MinimalJob<T, R, N>,
    returnValue: R,
    removeOnComplete: boolean | number | KeepJobs,
    token: string,
    fetchNext: boolean,
  ): ReturnType<IQueueBackend['moveToCompleted']>;

  abstract moveToFailed<
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
  ): ReturnType<IQueueBackend['moveToFailed']>;

  abstract moveToDelayed(
    jobId: string,
    timestamp: number,
    delay: number,
    token?: string,
    opts?: MoveToDelayedOpts,
  ): ReturnType<IQueueBackend['moveToDelayed']>;

  // U-flow: explicitly unsupported by the in-memory audit.
  async moveToWaitingChildren(
    _jobId: string,
    _token: string,
    _opts?: MoveToWaitingChildrenOpts,
  ): Promise<boolean> {
    throw new Error(
      'Unsupported in-memory queue operation: moveToWaitingChildren',
    );
  }

  abstract moveJobFromActiveToWait(
    jobId: string,
    token?: string,
  ): Promise<number>;

  abstract retryJob(
    jobId: string,
    lifo: boolean,
    token?: string,
    opts?: RetryJobOpts,
  ): Promise<void>;

  // U-job-mutation: explicitly unsupported by the in-memory audit.
  async retryFinishedJob<
    T = MinimalJob['data'],
    R = MinimalJob['returnvalue'],
    N extends string = string,
  >(
    _job: MinimalJob<T, R, N>,
    _state: 'failed' | 'completed',
    _opts?: RetryOptions,
  ): Promise<void> {
    throw new Error('Unsupported in-memory queue operation: retryFinishedJob');
  }

  // U-job-mutation: explicitly unsupported by the in-memory audit.
  async promote(_jobId: string): Promise<void> {
    throw new Error('Unsupported in-memory queue operation: promote');
  }

  abstract moveStalledJobsToWait(): Promise<string[]>;

  // U-admin: explicitly unsupported by the in-memory audit.
  async retryFinishedJobs(
    _state?: FinishedStatus,
    _count?: number,
    _timestamp?: number,
  ): Promise<number> {
    throw new Error('Unsupported in-memory queue operation: retryFinishedJobs');
  }

  // U-admin: explicitly unsupported by the in-memory audit.
  async promoteJobs(_count?: number): Promise<number> {
    throw new Error('Unsupported in-memory queue operation: promoteJobs');
  }

  // U-admin: explicitly unsupported by the in-memory audit.
  async pause(_pause: boolean): Promise<void> {
    throw new Error('Unsupported in-memory queue operation: pause');
  }

  abstract drain(delayed: boolean): Promise<void>;

  // U-admin: explicitly unsupported by the in-memory audit.
  async cleanJobsByState(
    _state: string,
    _timestamp: number,
    _limit?: number,
  ): Promise<string[]> {
    throw new Error('Unsupported in-memory queue operation: cleanJobsByState');
  }

  // U-admin: explicitly unsupported by the in-memory audit.
  async obliterate(_opts: { force: boolean; count: number }): Promise<number> {
    throw new Error('Unsupported in-memory queue operation: obliterate');
  }

  // U-admin: explicitly unsupported by the in-memory audit.
  async removeOrphanedJobs(_count?: number, _limit?: number): Promise<number> {
    throw new Error(
      'Unsupported in-memory queue operation: removeOrphanedJobs',
    );
  }

  // U-job-mutation: explicitly unsupported by the in-memory audit.
  async extendLock(
    _jobId: string,
    _token: string,
    _duration: number,
  ): Promise<number> {
    throw new Error('Unsupported in-memory queue operation: extendLock');
  }

  abstract extendLocks(
    jobIds: string[],
    tokens: string[],
    duration: number,
  ): Promise<string[]>;

  // U-job-mutation: explicitly unsupported by the in-memory audit.
  async updateData<
    T = MinimalJob['data'],
    R = MinimalJob['returnvalue'],
    N extends string = string,
  >(_job: MinimalJob<T, R, N>, _data: T): Promise<void> {
    throw new Error('Unsupported in-memory queue operation: updateData');
  }

  // U-job-mutation: explicitly unsupported by the in-memory audit.
  async updateProgress(_jobId: string, _progress: JobProgress): Promise<void> {
    throw new Error('Unsupported in-memory queue operation: updateProgress');
  }

  // U-logs-metrics: explicitly unsupported by the in-memory audit.
  async addLog(
    _jobId: string,
    _logRow: string,
    _keepLogs?: number,
  ): Promise<number> {
    throw new Error('Unsupported in-memory queue operation: addLog');
  }

  // U-logs-metrics: explicitly unsupported by the in-memory audit.
  async clearLogs(_jobId: string, _keepLogs?: number): Promise<void> {
    throw new Error('Unsupported in-memory queue operation: clearLogs');
  }

  // U-job-mutation: explicitly unsupported by the in-memory audit.
  async changeDelay(_jobId: string, _delay: number): Promise<void> {
    throw new Error('Unsupported in-memory queue operation: changeDelay');
  }

  // U-job-mutation: explicitly unsupported by the in-memory audit.
  async changePriority(
    _jobId: string,
    _priority?: number,
    _lifo?: boolean,
  ): Promise<void> {
    throw new Error('Unsupported in-memory queue operation: changePriority');
  }

  // U-job-mutation: explicitly unsupported by the in-memory audit.
  async remove(_jobId: string, _removeChildren: boolean): Promise<number> {
    throw new Error('Unsupported in-memory queue operation: remove');
  }

  // U-flow: explicitly unsupported by the in-memory audit.
  async removeUnprocessedChildren(_jobId: string): Promise<void> {
    throw new Error(
      'Unsupported in-memory queue operation: removeUnprocessedChildren',
    );
  }

  // U-flow: explicitly unsupported by the in-memory audit.
  async removeChildDependency(
    _jobId: string,
    _parentKey: string,
  ): Promise<boolean> {
    throw new Error(
      'Unsupported in-memory queue operation: removeChildDependency',
    );
  }

  // U-dedup: explicitly unsupported by the in-memory audit.
  async removeDeduplicationKey(
    _deduplicationId: string,
    _jobId: string,
  ): Promise<number> {
    throw new Error(
      'Unsupported in-memory queue operation: removeDeduplicationKey',
    );
  }

  // U-dedup: explicitly unsupported by the in-memory audit.
  async deleteDeduplicationKey(_deduplicationId: string): Promise<number> {
    throw new Error(
      'Unsupported in-memory queue operation: deleteDeduplicationKey',
    );
  }

  // U-scheduler: explicitly unsupported by the in-memory audit.
  async updateJobSchedulerNextMillis(
    _jobSchedulerId: string,
    _nextMillis: number,
    _templateData: string,
    _delayedJobOpts: JobsOptions,
    _producerId?: string,
  ): Promise<string | null> {
    throw new Error(
      'Unsupported in-memory queue operation: updateJobSchedulerNextMillis',
    );
  }

  // U-scheduler: explicitly unsupported by the in-memory audit.
  async removeJobScheduler(_jobSchedulerId: string): Promise<number> {
    throw new Error(
      'Unsupported in-memory queue operation: removeJobScheduler',
    );
  }

  // U-scheduler: explicitly unsupported by the in-memory audit.
  async getJobScheduler(
    _id: string,
  ): ReturnType<IQueueBackend['getJobScheduler']> {
    throw new Error('Unsupported in-memory queue operation: getJobScheduler');
  }

  // U-scheduler: explicitly unsupported by the in-memory audit.
  async isJobScheduler(_id: string): Promise<boolean> {
    throw new Error('Unsupported in-memory queue operation: isJobScheduler');
  }

  // U-scheduler: explicitly unsupported by the in-memory audit.
  async getJobSchedulerData(_key: string): Promise<Record<string, string>> {
    throw new Error(
      'Unsupported in-memory queue operation: getJobSchedulerData',
    );
  }

  // U-scheduler: explicitly unsupported by the in-memory audit.
  async getJobSchedulersRange(
    _start: number,
    _end: number,
    _asc: boolean,
  ): Promise<string[]> {
    throw new Error(
      'Unsupported in-memory queue operation: getJobSchedulersRange',
    );
  }

  // U-scheduler: explicitly unsupported by the in-memory audit.
  async getJobSchedulersCount(): Promise<number> {
    throw new Error(
      'Unsupported in-memory queue operation: getJobSchedulersCount',
    );
  }

  abstract getState(jobId: string): Promise<JobState | 'unknown'>;

  // U-inspection: explicitly unsupported by the in-memory audit.
  async isFinished(
    _jobId: string,
    _returnValue?: boolean,
  ): Promise<number | [number, string]> {
    throw new Error('Unsupported in-memory queue operation: isFinished');
  }

  // U-inspection: explicitly unsupported by the in-memory audit.
  async isMaxed(): Promise<boolean> {
    throw new Error('Unsupported in-memory queue operation: isMaxed');
  }

  abstract isJobInState(state: string, jobId: string): Promise<boolean>;

  abstract getJobData(jobId: string): Promise<JobJson | undefined>;

  // U-dedup: explicitly unsupported by the in-memory audit.
  async getDeduplicationJobId(
    _deduplicationId: string,
  ): Promise<string | null> {
    throw new Error(
      'Unsupported in-memory queue operation: getDeduplicationJobId',
    );
  }

  // U-logs-metrics: explicitly unsupported by the in-memory audit.
  async getJobLogs(
    _jobId: string,
    _start: number,
    _end: number,
    _asc: boolean,
  ): ReturnType<IQueueBackend['getJobLogs']> {
    throw new Error('Unsupported in-memory queue operation: getJobLogs');
  }

  // U-inspection: explicitly unsupported by the in-memory audit.
  async getRateLimitTtl(_maxJobs?: number): Promise<number> {
    throw new Error('Unsupported in-memory queue operation: getRateLimitTtl');
  }

  abstract getCounts(types: JobType[]): Promise<number[]>;

  // U-inspection: explicitly unsupported by the in-memory audit.
  async getCountsPerPriority(_priorities: number[]): Promise<number[]> {
    throw new Error(
      'Unsupported in-memory queue operation: getCountsPerPriority',
    );
  }

  abstract getRanges(
    types: JobType[],
    start?: number,
    end?: number,
    asc?: boolean,
  ): Promise<[string][]>;

  // U-flow: explicitly unsupported by the in-memory audit.
  async getDependencyCounts(
    _jobId: string,
    _types: string[],
  ): Promise<number[]> {
    throw new Error(
      'Unsupported in-memory queue operation: getDependencyCounts',
    );
  }

  // U-flow: explicitly unsupported by the in-memory audit.
  async getDependencies(
    _jobId: string,
    _opts: DependenciesOpts,
  ): ReturnType<IQueueBackend['getDependencies']> {
    throw new Error('Unsupported in-memory queue operation: getDependencies');
  }

  // U-flow: explicitly unsupported by the in-memory audit.
  async getProcessedChildrenValues(
    _jobId: string,
  ): Promise<Record<string, string>> {
    throw new Error(
      'Unsupported in-memory queue operation: getProcessedChildrenValues',
    );
  }

  // U-flow: explicitly unsupported by the in-memory audit.
  async getIgnoredChildrenFailures(
    _jobId: string,
  ): Promise<Record<string, string>> {
    throw new Error(
      'Unsupported in-memory queue operation: getIgnoredChildrenFailures',
    );
  }

  // U-logs-metrics: explicitly unsupported by the in-memory audit.
  async getMetrics(
    _type: 'completed' | 'failed',
    _start?: number,
    _end?: number,
  ): Promise<[string[], string[], number]> {
    throw new Error('Unsupported in-memory queue operation: getMetrics');
  }

  // U-logs-metrics: explicitly unsupported by the in-memory audit.
  async getClientList(): Promise<string[]> {
    throw new Error('Unsupported in-memory queue operation: getClientList');
  }

  // U-flow: explicitly unsupported by the in-memory audit.
  async paginate(
    _key: string,
    _opts: {
      start: number;
      end: number;
      fetchJobs?: boolean;
    },
  ): ReturnType<IQueueBackend['paginate']> {
    throw new Error('Unsupported in-memory queue operation: paginate');
  }

  abstract setQueueMeta(
    values: Record<string, string | number>,
  ): Promise<number>;

  // U-inspection: explicitly unsupported by the in-memory audit.
  async getQueueMetaField(_field: string): Promise<string | null> {
    throw new Error('Unsupported in-memory queue operation: getQueueMetaField');
  }

  // U-inspection: explicitly unsupported by the in-memory audit.
  async getQueueMetaFields(_fields: string[]): Promise<(string | null)[]> {
    throw new Error(
      'Unsupported in-memory queue operation: getQueueMetaFields',
    );
  }

  // U-inspection: explicitly unsupported by the in-memory audit.
  async getQueueMeta(): Promise<Record<string, string>> {
    throw new Error('Unsupported in-memory queue operation: getQueueMeta');
  }

  abstract removeQueueMetaFields(fields: string[]): Promise<number>;

  // U-inspection: explicitly unsupported by the in-memory audit.
  async hasQueueMetaField(_field: string): Promise<boolean> {
    throw new Error('Unsupported in-memory queue operation: hasQueueMetaField');
  }

  // U-inspection: explicitly unsupported by the in-memory audit.
  async setRateLimit(_expireTimeMs: number): Promise<void> {
    throw new Error('Unsupported in-memory queue operation: setRateLimit');
  }

  // U-inspection: explicitly unsupported by the in-memory audit.
  async removeRateLimitKey(): Promise<number> {
    throw new Error(
      'Unsupported in-memory queue operation: removeRateLimitKey',
    );
  }

  // U-admin: explicitly unsupported by the in-memory audit.
  async removeDeprecatedPriorityKey(): Promise<number> {
    throw new Error(
      'Unsupported in-memory queue operation: removeDeprecatedPriorityKey',
    );
  }

  // U-event-stream: explicitly unsupported by the in-memory audit.
  async trimEvents(_maxLength: number): Promise<number> {
    throw new Error('Unsupported in-memory queue operation: trimEvents');
  }

  // U-event-stream: explicitly unsupported by the in-memory audit.
  async publishEvent(
    _fields: Record<string, string | number>,
    _maxEvents: number,
  ): Promise<string> {
    throw new Error('Unsupported in-memory queue operation: publishEvent');
  }

  // U-event-stream: explicitly unsupported by the in-memory audit.
  async readEvents(_id: string, _blockTimeout: number): Promise<StreamReadRaw> {
    throw new Error('Unsupported in-memory queue operation: readEvents');
  }

  abstract waitForJob(
    blockTimeout: number,
  ): ReturnType<IQueueBackend['waitForJob']>;

  abstract disconnectBlocking(wait?: boolean): Promise<void>;

  abstract reconnectBlocking(): Promise<void>;
}
