import type { FilesRuntime } from '../../runtime.js';
import { Job, type JobOptions } from '@nocobase/queue';

import type { FilesCleanupResult } from '../cleanup.js';
import { getFilesRuntimeCleanup } from '../runtime.js';

export const FILES_CLEANUP_SCHEDULE_INTERVAL = '5m';
export const FILES_CLEANUP_SCHEDULE_PREFIX = 'nocobase-files-cleanup';

export interface CleanupExpiredUploadsPayload {
  batchSize: number;
  timeBudgetMs: number;
}

export interface CleanupExpiredUploadsJobDependencies {
  filesRuntime?: FilesRuntime;
  logger: {
    info(data: Record<string, unknown>, message: string): void;
    warn(data: Record<string, unknown>, message: string): void;
  };
}

export default class CleanupExpiredUploadsJob extends Job<CleanupExpiredUploadsPayload> {
  static options: JobOptions = {
    name: 'FilesCleanupExpiredUploads',
    queue: 'default',
    timeout: '30s',
  };

  private readonly dependencies:
    CleanupExpiredUploadsJobDependencies | undefined;

  constructor(
    dependencies: CleanupExpiredUploadsJobDependencies | undefined = undefined,
  ) {
    super();
    this.dependencies = dependencies;
  }

  async execute(): Promise<void> {
    const dependencies = requireDependencies(this.dependencies);
    const result = await runCleanupExpiredUploads(dependencies, this.payload);
    const log = {
      jobId: this.context.jobId,
      attempt: this.context.attempt,
      ...result,
    };
    if (result.deleteFailures > 0) {
      dependencies.logger.warn(
        log,
        'Files expired upload cleanup completed with retryable delete failures',
      );
      return;
    }
    dependencies.logger.info(log, 'Files expired upload cleanup completed');
  }
}

export function runCleanupExpiredUploads(
  dependencies: CleanupExpiredUploadsJobDependencies,
  payload: CleanupExpiredUploadsPayload,
): Promise<FilesCleanupResult> {
  const runtime = dependencies.filesRuntime;
  if (!runtime) {
    throw new Error('Files cleanup requires the application Files runtime.');
  }
  return getFilesRuntimeCleanup(runtime).run(payload);
}

function requireDependencies(
  dependencies: CleanupExpiredUploadsJobDependencies | undefined,
): CleanupExpiredUploadsJobDependencies {
  if (!dependencies) {
    throw new Error('Files cleanup job dependencies are unavailable.');
  }
  return dependencies;
}
