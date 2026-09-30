import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import {
  Job,
  type JobExecutionContext,
  type JobExecutor,
  type JobReceipt,
} from '@nocobase/jobs';
import type { ServiceContainer } from '@nocobase/service-provider';

export interface __NOCOBASE_SYMBOL_NAME__JobPayload {
  readonly requestedAt: string;
}

// This plugin's own executor scope. The application's `jobs` configuration decides the backend.
export const __NOCOBASE_MODULE_NAME__JobScope: string =
  __NOCOBASE_PACKAGE_NAME_LITERAL__;

export class __NOCOBASE_SYMBOL_NAME__Job extends Job<__NOCOBASE_SYMBOL_NAME__JobPayload> {
  // The handler identity stored with every task: keep it stable across class and file renames.
  public static readonly jobName: string = __NOCOBASE_JOB_NAME_LITERAL__;

  public async execute({ signal }: JobExecutionContext): Promise<void> {
    signal.throwIfAborted();
    // A queued task may predate the current payload shape, so check it at run time.
    const payload: unknown = this.payload;
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('requestedAt' in payload) ||
      typeof payload.requestedAt !== 'string' ||
      !payload.requestedAt.trim()
    ) {
      throw new TypeError('Expected a nonempty requestedAt string');
    }
    // Call an idempotent domain operation here and pass its cancellation signal.
  }
}

/** The executor this plugin registers its jobs on, sets up and shuts down. */
export function get__NOCOBASE_SYMBOL_NAME__JobExecutor(
  container: ServiceContainer,
): JobExecutor {
  return container
    .resolve(jobExecutorServiceToken)
    .getJobExecutor(__NOCOBASE_MODULE_NAME__JobScope);
}

/** Resolves once the backend accepts the task, not once it has run. */
export async function submit__NOCOBASE_SYMBOL_NAME__(
  container: ServiceContainer,
  payload: __NOCOBASE_SYMBOL_NAME__JobPayload,
): Promise<JobReceipt> {
  return get__NOCOBASE_SYMBOL_NAME__JobExecutor(container).addJob(
    new __NOCOBASE_SYMBOL_NAME__Job(payload),
  );
}
