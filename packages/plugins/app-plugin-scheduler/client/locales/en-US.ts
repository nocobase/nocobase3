import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  nav: { automation: 'Automation', schedules: 'Scheduled tasks' },
  page: {
    title: 'Scheduled tasks',
    filters: {
      searchLabel: 'Search schedules',
      searchPlaceholder: 'Search name, target type, or schedule…',
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
    actions: { enable: 'Enable', disable: 'Disable' },
    columns: {
      name: 'Name',
      scheduleTimezone: 'Schedule / timezone',
      triggered: 'Triggered',
      nextRun: 'Next trigger',
      target: 'Target',
      status: 'Status',
    },
    targets: {
      job: 'Job',
      workflow: 'Workflow',
    },
    targetStates: {
      ready: 'Ready',
      disabled: 'Disabled',
      missing: 'Missing',
      invalid: 'Invalid',
    },
    pagination: {
      previous: 'Previous',
      next: 'Next',
      summary: 'Page {{page}} of {{total}}',
    },
    loading: 'Loading scheduled tasks…',
    empty: 'No scheduled tasks are defined.',
    noMatches: 'No scheduled tasks match these filters.',
    details: {
      back: 'Back to scheduled tasks',
      loading: 'Loading schedule details…',
      notFound: 'The scheduled task was not found.',
      overview: 'Overview',
      triggers: 'Execution records',
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
    triggersLoading: 'Loading triggers…',
    triggersEmpty: 'No triggers have started.',
    triggerColumns: {
      startedAt: 'Execution time',
      duration: 'Duration',
      status: 'Status',
      target: 'Execution target',
    },
    triggerStatuses: {
      running: 'Running',
      waiting: 'Waiting for target',
      succeeded: 'Succeeded',
      triggered: 'Triggered (result unknown)',
      skipped: 'Skipped',
      failed: 'Failed',
      cancelled: 'Cancelled',
      timed_out: 'Timed out',
    },
    inProgress: 'In progress',
    viewTarget: 'View',
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
