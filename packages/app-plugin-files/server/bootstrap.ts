import { createHash } from 'node:crypto';

import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import {
  DEFAULT_FILES_CLEANUP_BATCH_SIZE,
  DEFAULT_FILES_CLEANUP_TIME_BUDGET_MS,
} from './internal/cleanup.js';
import CleanupExpiredUploadsJob, {
  FILES_CLEANUP_SCHEDULE_INTERVAL,
  FILES_CLEANUP_SCHEDULE_PREFIX,
} from './internal/jobs/cleanup-expired-uploads.js';
import { getFilesRuntimeAudience } from './internal/runtime.js';
import type { FilesRuntime } from './runtime.js';

export interface FilesPluginBootstrapDependencies {
  filesRuntime?: FilesRuntime;
  queueManager: NocoBaseQueueManager;
  logging: {
    getLogger(name?: string): {
      error(data: Record<string, unknown>, message: string): void;
    };
  };
}

export type FilesPluginBootstrapContext =
  AppPluginServerContext<FilesPluginBootstrapDependencies>;

export default function bootstrapFilesPlugin({
  deps,
  lifecycle,
}: FilesPluginBootstrapContext): void {
  const runtime = deps.filesRuntime;
  if (!runtime) {
    return;
  }
  const logger = deps.logging.getLogger('files-cleanup');
  const worker = deps.queueManager.createWorker();
  let disposed = false;
  deps.queueManager.registerJob(CleanupExpiredUploadsJob);
  const workerTask = deps.queueManager
    .init()
    .then(async () => {
      await CleanupExpiredUploadsJob.schedule({
        batchSize: DEFAULT_FILES_CLEANUP_BATCH_SIZE,
        timeBudgetMs: DEFAULT_FILES_CLEANUP_TIME_BUDGET_MS,
      })
        .id(filesCleanupScheduleId(getFilesRuntimeAudience(runtime)))
        .every(FILES_CLEANUP_SCHEDULE_INTERVAL)
        .run();
      if (disposed) {
        return;
      }
      await worker.start();
    })
    .catch(() => {
      logger.error(
        { code: 'FILES_CLEANUP_WORKER_FAILED' },
        'Files cleanup worker stopped unexpectedly',
      );
    });

  lifecycle.registerDisposer('cleanup-worker', async () => {
    disposed = true;
    await worker.stop();
    await workerTask;
  });
}

export function filesCleanupScheduleId(audience: string): string {
  const suffix = createHash('sha256')
    .update(audience)
    .digest('hex')
    .slice(0, 16);
  return `${FILES_CLEANUP_SCHEDULE_PREFIX}:${suffix}`;
}
