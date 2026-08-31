import { CronJob } from 'cron';

import type { CronJobManager, CronJobParameters } from './types.js';

const CLOSED_ERROR_MESSAGE = 'Cron job manager is closed.';

export function createCronJobManager(): CronJobManager {
  const jobs = new Set<CronJob>();
  let started = false;
  let closed = false;

  const assertOpen = (): void => {
    if (closed) {
      throw new Error(CLOSED_ERROR_MESSAGE);
    }
  };

  return {
    get started(): boolean {
      return started;
    },

    get jobs(): ReadonlySet<CronJob> {
      return jobs;
    },

    addJob(options: CronJobParameters): CronJob {
      assertOpen();
      const job = CronJob.from({
        ...options,
        runOnInit: false,
        start: false,
      });
      jobs.add(job);

      if (started) {
        job.start();
      }

      return job;
    },

    removeJob(job: CronJob): void {
      if (!jobs.delete(job)) {
        return;
      }

      void job.stop();
    },

    start(): void {
      assertOpen();
      if (started) {
        return;
      }

      for (const job of jobs) {
        job.start();
      }
      started = true;
    },

    stop(): void {
      if (!started) {
        return;
      }

      for (const job of jobs) {
        void job.stop();
      }
      started = false;
    },

    close(): void {
      if (closed) {
        return;
      }

      for (const job of jobs) {
        void job.stop();
      }
      jobs.clear();
      started = false;
      closed = true;
    },
  };
}
