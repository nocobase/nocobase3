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
    if (!context.scheduleId) {
      throw new Error(
        'ScheduleDispatchJob requires a schedule id in its occurrence context.',
      );
    }
    // The occurrence is identified by the queue's job id alone. Nothing else
    // about the firing is read from the transport, which is what keeps
    // `@boringnode/queue` an unmodified dependency.
    const executionContext = {
      scheduleId: this.payload.scheduleId,
      occurrenceId: context.jobId,
    };
    const targetState = (
      await this.registry.describe(
        this.payload.target.type,
        this.payload.target.config,
      )
    ).state;
    if (targetState && targetState !== 'ready') {
      await this.occurrences.skip(
        context.jobId,
        `target-${targetState ?? 'unavailable'}`,
      );
      return;
    }
    const action = await this.occurrences.start(
      executionContext,
      this.payload.definitionHash,
      this.payload.target.type,
    );
    if (action === 'noop') return;
    try {
      const result = await this.registry.start(
        this.payload.target.type,
        this.payload.target.config,
        executionContext,
      );
      switch (result.state) {
        case 'completed':
          await this.occurrences.succeed(context.jobId, result.result);
          return;
        case 'accepted': {
          await this.occurrences.wait(
            context.jobId,
            result.reference,
            result.receipt,
          );
          const observation = await this.registry.inspect(
            this.payload.target.type,
            result.reference,
          );
          if (observation.state === 'completed')
            await this.occurrences.complete(
              context.jobId,
              result.reference,
              observation.completion,
            );
          return;
        }
        case 'skipped':
          await this.occurrences.skip(context.jobId, result.reason);
          return;
        case 'failed':
          await this.occurrences.fail(context.jobId, result.reason);
          return;
      }
    } catch (error) {
      try {
        await this.occurrences.fail(context.jobId, 'dispatch-failed');
      } catch (completionError) {
        console.error('Failed to record schedule dispatch failure', {
          occurrenceId: context.jobId,
          error: completionError,
        });
      }
      throw error;
    }
  }
}

export default ScheduleDispatchJob;
