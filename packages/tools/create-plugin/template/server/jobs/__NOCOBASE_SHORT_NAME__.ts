import { Job, type JobOptions } from '@nocobase/queue';

export interface __NOCOBASE_SYMBOL_NAME__JobPayload {
  readonly requestedAt: string;
}

export default class __NOCOBASE_SYMBOL_NAME__Job extends Job<__NOCOBASE_SYMBOL_NAME__JobPayload> {
  public static options: JobOptions = {
    // Keep the persisted queue identity independent of class and file renames.
    name: __NOCOBASE_JOB_NAME_LITERAL__,
    queue: 'default',
  };

  public async execute(): Promise<void> {
    // Orchestrate retryable work here; keep domain behavior in a Service.
  }
}
