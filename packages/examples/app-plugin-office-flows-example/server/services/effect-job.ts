import { Job, type JobClass, type JobExecutionContext } from '@nocobase/jobs';
import type { LifecycleRuntime } from '@nocobase/lifecycle';

import { OFFICE_FLOWS_SCOPE } from '../scope.js';

export interface EffectJobPayload {
  readonly effectRunId: string;
}

/**
 * Runs one attempt of an effect run on the application's jobs service. The
 * run's state lives in the database, so the job carries only its id; a job
 * handed the same run twice executes it once.
 */
export function createEffectJob(
  runtime: LifecycleRuntime,
): JobClass<EffectJobPayload> {
  return class LifecycleEffectJob extends Job<EffectJobPayload> {
    // Stored with every queued task: keep it stable.
    public static readonly jobName: string = `${OFFICE_FLOWS_SCOPE}/effect`;

    public async execute({ signal }: JobExecutionContext): Promise<void> {
      await runtime.runEffect(this.payload.effectRunId, signal);
    }
  };
}
