import { Job, type JobOptions } from '@nocobase/queue';

import type { FilesRuntime } from '../runtime.js';
import { runFilesCleanup } from '../internal/runtime.js';

export interface CleanupExpiredUploadsPayload {
  batchSize?: number;
  timeBudgetMs?: number;
}

export interface CleanupExpiredUploadsJobDependencies {
  filesRuntime?: FilesRuntime;
  logger?: {
    info?(data: Record<string, unknown>, message: string): void;
    warn?(data: Record<string, unknown>, message: string): void;
  };
}

export default class CleanupExpiredUploadsJob extends Job<CleanupExpiredUploadsPayload> {
  static options: JobOptions = {
    name: 'FilesCleanupExpiredUploads',
    queue: 'default',
    maxRetries: 2,
    timeout: '30s',
  };

  constructor(
    private readonly dependencies: CleanupExpiredUploadsJobDependencies = {},
  ) {
    super();
  }

  async execute(): Promise<void> {
    const runtime = this.dependencies.filesRuntime;
    if (!runtime) {
      this.dependencies.logger?.warn?.(
        { jobId: this.context.jobId },
        'Files cleanup skipped because the Files plugin is disabled.',
      );
      return;
    }
    const result = await runFilesCleanup(runtime, this.payload);
    this.dependencies.logger?.info?.(
      {
        jobId: this.context.jobId,
        scanned: result.pending.scanned,
        failed: result.pending.failed,
        deleted: result.pending.deleted,
        purged: result.pending.purged,
        deletionFailures: result.pending.deletionFailures,
        reservationsReleased: result.reservationsReleased,
        hasMore: result.hasMore,
      },
      'Files expired uploads cleanup completed.',
    );
  }
}
