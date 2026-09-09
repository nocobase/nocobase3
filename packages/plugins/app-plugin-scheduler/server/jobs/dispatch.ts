import { Job, type JobOptions } from '@nocobase/queue';
import type { JsonObject } from '../schedules/define.js';
import type { ScheduleTargetRegistry } from '../schedules/registry.js';
import type { ScheduleOccurrenceStore } from '../occurrences.js';

export interface ScheduleDispatchPayload {
  readonly schemaVersion: 1;
  readonly scheduleId: string;
  readonly target: { readonly type: string; readonly config: JsonObject };
  readonly definitionHash: string;
}

export class ScheduleDispatchJob extends Job<ScheduleDispatchPayload> {
  public static options: JobOptions = {
    name: 'ScheduleDispatchJob',
    queue: 'schedule',
    adapter: 'database',
    maxRetries: 0,
  };
  public constructor(
    private readonly registry: ScheduleTargetRegistry,
    private readonly occurrences: ScheduleOccurrenceStore,
  ) {
    super();
  }
  public async execute(): Promise<void> {
    const context = this.context;
    if (
      !context.scheduleId ||
      !context.scheduledFor ||
      !context.scheduleRunNumber
    ) {
      throw new Error(
        'ScheduleDispatchJob requires complete Schedule occurrence context.',
      );
    }
    const executionContext = {
      scheduleId: this.payload.scheduleId,
      occurrenceId: context.jobId,
      scheduledFor: context.scheduledFor,
      runNumber: context.scheduleRunNumber,
    };
    await this.occurrences.start(
      executionContext,
      this.payload.definitionHash,
      this.payload.target.type,
    );
    const result = await this.registry.execute(
      this.payload.target.type,
      this.payload.target.config,
      executionContext,
    );
    await this.occurrences.finish(context.jobId, result);
    if (result.status === 'failed') {
      throw new Error(`Schedule target failed: ${result.reason ?? 'unknown'}`);
    }
  }
}

export default ScheduleDispatchJob;
