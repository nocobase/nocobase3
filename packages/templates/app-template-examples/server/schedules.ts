import {
  defineSchedule,
  type NormalizedScheduleDefinition,
} from '@nocobase/app-plugin-scheduler/server';

const schedules: readonly NormalizedScheduleDefinition[] = [
  defineSchedule({
    key: 'example-test-job-every-5-minutes',
    title: '报时（服务端日志）',
    description:
      'Writes the current server time to the server log every five minutes.',
    schedule: { cron: '*/5 * * * *', timezone: 'Asia/Singapore' },
    target: {
      type: 'job',
      config: { jobName: 'app.scheduled-log', payload: { message: '报时' } },
    },
  }),
  defineSchedule({
    key: 'example-test-workflow-every-5-minutes',
    title: '测试工作流（每五分钟）',
    description:
      'Invokes the scheduled test workflow every five minutes; the workflow waits five seconds before completing.',
    schedule: { cron: '*/5 * * * *', timezone: 'Asia/Singapore' },
    target: {
      type: 'workflow',
      config: {
        workflowKey: 'scheduled-test-workflow',
        input: {},
      },
    },
  }),
];

export default schedules;
