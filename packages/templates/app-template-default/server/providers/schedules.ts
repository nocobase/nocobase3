import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

export default class SchedulesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/schedules';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(schedulerServiceToken)) return;
    const scheduler = this.app.container.resolve(schedulerServiceToken);
    const logger = this.app.container.resolve(loggingToken).getLogger();

    scheduler.registerTarget({
      type: 'app.scheduled-log',
      title: '服务端日志',
      validate(config) {
        return config !== null &&
          typeof config === 'object' &&
          !Array.isArray(config) &&
          typeof (config as { message?: unknown }).message === 'string'
          ? { valid: true }
          : { valid: false, reason: 'message-must-be-a-string' };
      },
      async start(config, context) {
        const executedAt = new Date().toISOString();
        logger.info(
          { ...context, message: config.message, executedAt },
          'Scheduled log',
        );
        return {
          state: 'completed',
          outcome: 'succeeded',
          result: { message: config.message, executedAt },
        };
      },
    });

    scheduler.defineSchedule({
      key: 'app.log-every-30-seconds',
      title: '测试报时（每 30 秒）',
      description: '每 30 秒写入服务端日志，用于观察连续触发和执行记录。',
      schedule: { cron: '*/30 * * * * *', timezone: 'Asia/Singapore' },
      target: { type: 'app.scheduled-log', config: { message: '30 秒报时' } },
    });
    scheduler.defineSchedule({
      key: 'app.log-every-minute',
      title: '测试报时（每分钟）',
      description: '每分钟写入服务端日志，用于测试任务启用和停用。',
      schedule: { cron: '* * * * *', timezone: 'Asia/Singapore' },
      target: { type: 'app.scheduled-log', config: { message: '每分钟报时' } },
    });
    scheduler.defineSchedule({
      key: 'app.log-every-5-minutes',
      title: '测试报时（每 5 分钟）',
      description: '每 5 分钟写入服务端日志，用于观察下一次执行时间。',
      schedule: { cron: '*/5 * * * *', timezone: 'Asia/Singapore' },
      target: { type: 'app.scheduled-log', config: { message: '5 分钟报时' } },
    });
  }
}
