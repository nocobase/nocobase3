import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  nav: { automation: 'Automation', schedules: 'Scheduled tasks' },
  page: {
    title: 'Scheduled tasks',
    description: 'Read-only code-defined schedules and their trigger history.',
    readOnly: 'Read only',
    summary: {
      total: 'Total schedules',
      active: 'Active schedules',
      triggers: 'Triggers',
    },
    filters: {
      searchLabel: 'Search schedules',
      searchPlaceholder: 'Search name, target, or schedule…',
      statusLabel: 'Filter by status',
      targetLabel: 'Filter by target type',
      allStatuses: 'All statuses',
      allTargets: 'All target types',
    },
    statuses: {
      active: 'Active',
      paused: 'Paused',
      inactive: 'Inactive',
      targetIssue: 'Target issue',
    },
    columns: {
      name: 'Name',
      scheduleTimezone: 'Schedule / timezone',
      status: 'Status',
      triggers: 'Triggers',
      lastTrigger: 'Last trigger',
      nextRun: 'Next run',
      target: 'Target',
    },
    loading: 'Loading scheduled tasks…',
    empty: 'No scheduled tasks are defined.',
    noMatches: 'No scheduled tasks match these filters.',
    details: {
      back: 'Back to scheduled tasks',
      loading: 'Loading schedule details…',
      notFound: 'The scheduled task was not found.',
      overview: 'Overview',
      triggers: 'Triggers',
      schedule: 'Schedule',
      frequency: 'Frequency',
      timezone: 'Timezone',
      nextRun: 'Next run',
      lastTrigger: 'Last trigger',
      triggerCount: 'Trigger count',
      inactiveReason: 'Inactive reason',
      target: 'Execution target',
      targetName: 'Target',
      targetType: 'Target type',
      description: 'Description',
      targetIssueTitle: 'The execution target is unavailable',
      targetIssueBody:
        'This code-defined schedule cannot trigger until its target is available again.',
    },
    triggersHelp:
      'Triggered means the target accepted the request; it does not mean downstream work completed.',
    triggersLoading: 'Loading triggers…',
    triggersEmpty: 'No triggers have started.',
    triggerColumns: {
      scheduledFor: 'Scheduled for',
      timing: 'Started / finished',
      status: 'Status',
    },
    triggerStatuses: {
      running: 'Running',
      triggered: 'Triggered',
      skipped: 'Skipped',
      failed: 'Failed',
    },
    inProgress: 'In progress',
    invalidSchedule: 'Invalid schedule',
    unavailable: '—',
  },
  errors: {
    loadSchedules: 'Unable to load scheduled tasks.',
    loadOccurrences: 'Unable to load triggers.',
  },
};

/** English is the source of truth for this plugin's locale shape. */
export type SchedulerResource = LocaleResource<typeof enUS>;

export default enUS;
