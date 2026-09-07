import type { LocaleResource } from '@nocobase/i18n';
const enUS = {
  settings: {
    detailsLimit: 'Maximum details size (bytes)',
    title: 'Capture settings',
    health: 'Capture health',
    description:
      'Configure operation audit sources and retention for this application.',
    store: 'Configuration store',
    load: 'Load',
    loading: 'Loading…',
    refresh: 'Refresh',
    save: 'Save settings',
    saving: 'Saving…',
    revision: 'Revision {{revision}}',
    enabled: 'Enable audit',
    http: 'Declared HTTP routes',
    runtime: 'Integrated runtime producers',
    database: 'Database targets',
    source: 'Data source',
    table: 'Physical table',
    schema: 'Schema (optional)',
    add: 'Add target',
    remove: 'Remove target',
    observationStore: 'Observation store',
    retention: 'Retention days',
    forever: 'Do not automatically delete (null)',
    retentionHelp:
      'Use a positive whole number of days. Zero is invalid. Disabling audit does not delete existing evidence.',
    confirmTitle: 'Confirm shorter retention',
    confirmDescription:
      'Saving this shorter period allows future cleanup to permanently delete older audit events. This cannot restore deleted evidence.',
    confirm: 'Confirm and save',
    cancel: 'Cancel',
    mandatory:
      'Required by deployment policy. This scope cannot be removed here.',
    readonly:
      'Read only: managing this complete scope requires authorization and deployment metadata.',
    saved:
      'Configuration saved. Collector health is reported separately below; saving does not prove capture is ready.',
    forbidden: 'Permission denied for this store or operation.',
    invalid:
      'Invalid settings. Check positive whole retention days and target fields.',
    invalidStore: 'The data source or target is unsupported.',
    conflict:
      'The revision or deployment policy changed. Your draft is retained. Load the current settings to compare before editing again.',
    compare: 'Load current settings for comparison',
    current: 'Current server settings',
    draft: 'Your draft',
    useCurrent: 'Use current settings and edit again',
    unavailable:
      'Audit service unavailable. This is not evidence that there are no events.',
    unknown: 'Unknown',
    yes: 'Yes',
    no: 'No',
    instance: 'Instance',
    time: 'Observed at (UTC)',
    scope:
      'This observation applies only to the named instance and store. It does not report cluster-wide health.',
    coverageHelp:
      'Configured, registered, verified and observed describe different evidence. None proves every path is covered.',
    producer: 'Producer',
    configured: 'Configured',
    registered: 'Registered',
    verified: 'Verified',
    observed: 'Observed',
    success: 'Last success (UTC)',
    error: 'Last error',
    declarationUnknown:
      'The host has not supplied a complete static declaration inventory. Declared route coverage is unknown.',
    declarations: 'Declared HTTP middleware',
    declarationsHelp:
      'Static declarations describe middleware patterns, including wildcards. Authentication or earlier middleware may stop a request before a later declaration runs.',
    method: 'Method',
    path: 'Route pattern',
    action: 'Action',
    noCoverage: 'No collector observations are available for this scope.',
    noCaptures: 'Capture inventory is unavailable.',
    bound: 'Registered capture targets',
    unknownObservation: 'This instance or store has not been observed.',
    states: {
      disabled: 'Disabled',
      'ready-no-events': 'Ready — no events observed',
      healthy: 'Healthy',
      degraded: 'Degraded',
      misconfigured: 'Misconfigured',
      'partial-coverage': 'Partial coverage',
    },
    cleanup: 'Last cleanup',
    cutoff: 'Cutoff (UTC)',
    deleted: 'Deleted events',
  },
};
export type AuditSettingsResource = LocaleResource<typeof enUS>;
export default enUS;
