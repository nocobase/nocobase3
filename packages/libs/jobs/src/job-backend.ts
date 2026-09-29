import type { ResolvedScheduleExecutorConfig } from './config.js';
import type { JobExecutionContext, JobReceipt } from './job-types.js';

export interface JobSubmission {
  readonly jobName: string;
  readonly payload: unknown;
}

export interface JobRun extends JobExecutionContext {
  readonly payload: unknown;
}

export interface JobRunner {
  /** Rejects missing handlers and normal failures; normalizes shutdown interruption. */
  run(run: JobRun): Promise<void>;
}

export interface JobBackend {
  open(): Promise<void>;
  enqueue(job: JobSubmission): Promise<JobReceipt>;
  consume(runner: JobRunner): Promise<void>;
  /** Safe after partial open failure; never writes unread or corrupt state. */
  close(): Promise<void>;
}

/** The slash excludes this name from the valid Schedule scope domain. */
export function jobQueueName(
  config: Pick<ResolvedScheduleExecutorConfig, 'key' | 'scope'>,
): string {
  return `jobs/${Buffer.from(JSON.stringify([config.key, config.scope])).toString('base64url')}`;
}
