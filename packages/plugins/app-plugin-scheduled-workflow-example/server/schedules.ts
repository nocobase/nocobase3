import {
  defineSchedule,
  type NormalizedScheduleDefinition,
} from '@nocobase/app-plugin-scheduler/server';

const schedules: readonly NormalizedScheduleDefinition[] = [
  defineSchedule({
    key: 'scheduled-test-workflow-every-5-minutes',
    title: 'Scheduled test workflow every 5 minutes',
    description:
      'Runs the default application test workflow every five minutes.',
    schedule: {
      cron: '*/5 * * * *',
      timezone: 'Asia/Singapore',
    },
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
