import { loggingToken } from '@nocobase/app-server/logging';
import type { Application } from '@nocobase/app-server/application';
import type { JsonObject } from '@nocobase/app-plugin-scheduler/server';
import { jobDispatchRegistryToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

interface Payload extends JsonObject {
  readonly message: string;
}

export default class ScheduledLogJobProvider extends ServiceProvider<Application> {
  public readonly name = 'app/examples-scheduled-log-job';
  public override async boot(): Promise<void> {
    if (!this.app.container.has(jobDispatchRegistryToken)) return;
    const registry = this.app.container.resolve(jobDispatchRegistryToken);
    const logger = this.app.container.resolve(loggingToken).getLogger();
    registry.register({
      name: 'app.scheduled-log',
      title: '报时（服务端日志）',
      validate: (payload) =>
        payload !== null &&
        typeof payload === 'object' &&
        typeof (payload as { message?: unknown }).message === 'string'
          ? { valid: true }
          : { valid: false, reason: 'message-must-be-a-string' },
      async dispatch(payload: Payload, context) {
        const executedAt = new Date().toISOString();
        logger.info(
          {
            occurrenceId: context.occurrenceId,
            scheduleId: context.scheduleId,
            message: payload.message,
            executedAt,
          },
          'Scheduled log Job executed',
        );
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { message: payload.message, executedAt },
        };
      },
    });
  }
}
