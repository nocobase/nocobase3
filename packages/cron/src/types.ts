import type { CronJob, CronJobParams } from 'cron';

export type CronJobParameters = CronJobParams;

export interface CronJobManager {
  readonly started: boolean;
  readonly jobs: ReadonlySet<CronJob>;
  addJob(options: CronJobParameters): CronJob;
  removeJob(job: CronJob): void;
  start(): void;
  stop(): void;
  close(): void;
}
