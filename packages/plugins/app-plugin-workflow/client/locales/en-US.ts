import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  nav: {
    automation: 'Automation',
    workflows: 'Workflows',
    runs: 'Workflow runs',
  },
  common: {
    cancel: 'Cancel',
    save: 'Save',
    refresh: 'Refresh',
    run: 'Run',
    running: 'Running…',
    close: 'Close',
    description: 'Description',
    noData: 'No data to display',
    notSet: 'Not set',
    unpublished: 'Unpublished',
    duration: 'Duration {{duration}}',
    runCount: '{{count}} run',
    runCount_other: '{{count}} runs',
  },
  status: {
    queued: 'Queued',
    running: 'Running',
    resolved: 'Resolved',
    succeeded: 'Succeeded',
    failed: 'Failed',
    error: 'Error',
    aborted: 'Aborted',
    unknown: 'Unknown',
    enabled: 'Enabled',
    disabled: 'Disabled',
    on: 'On',
    off: 'Off',
  },
  actions: {
    more: 'More actions',
    enableWorkflow: 'Enable {{title}}',
    disableWorkflow: 'Disable {{title}}',
    parameterSettings: 'Parameter settings',
    runManually: 'Run manually',
  },
  filters: {
    searchWorkflowTitle: 'Search workflow title',
    filterWorkflowTitle: 'Filter workflow title',
    workflowStatus: 'Filter workflow status',
    runStatus: 'Filter run status',
    allStatuses: 'All statuses',
  },
  workflows: {
    title: 'Workflows',
    back: '← Workflows',
    loading: 'Loading workflow…',
    missingIdentifier:
      'Workflow has neither a synchronized ID nor an artifact hash.',
    noDescription: 'No workflow description provided.',
    noNodeDescription: 'No node description provided.',
    version: 'Version',
    runFailed: 'Unable to run workflow',
    parametersMissingIdentifier:
      'Workflow has no identifier for editing parameters.',
    runMissingIdentifier: 'Workflow has no identifier for manual execution.',
  },
  manualRun: {
    title: 'Run manually',
    description: 'Fill in the workflow input.',
  },
  runs: {
    title: 'Workflow runs',
    dialogTitle: 'Runs',
    back: '← Runs',
    loading: 'Loading run…',
    triggeredAt: 'Triggered at {{time}}',
  },
  inspector: {
    label: 'Workflow inspector',
    overview: 'Workflow overview',
    selectNode: 'Select a node to inspect it.',
    attempt: 'Attempt',
    closeResult: 'Close result',
    loadingResult: 'Loading result…',
    payloadTruncated: 'Large payload was truncated for display.',
    result: 'Result',
    log: 'Log',
    inputTitle: 'Workflow input',
    inputDescription: 'Input context available when this execution started.',
    closeInput: 'Close input',
    input: 'Input',
    stillRunning: 'running',
    unserializable: '[Unserializable value]',
  },
  canvas: {
    start: 'Start',
    end: 'End',
    condition: 'Condition',
    terminate: 'Terminate',
    run: 'Run',
    emptyBranch: 'Empty branch',
    yes: 'Yes',
    no: 'No',
    runLabel: 'Workflow run canvas',
    editableLabel: 'Workflow canvas',
    readOnlyLabel: 'Read-only workflow canvas',
    horizontalLayout: 'Horizontal layout',
    verticalLayout: 'Vertical layout',
    fitting: 'Fitting workflow to the viewport…',
    layingOut: 'Laying out workflow…',
  },
  pages: {
    list: {
      title: 'Workflows',
      description:
        'Install the workflow-management Registry item for the editable management interface.',
    },
    detail: {
      title: 'Workflow details',
      description:
        'Install the workflow-management Registry item for the editable management interface.',
    },
    runList: {
      title: 'Execution records',
      description:
        'Install the workflow-management Registry item for the editable management interface.',
    },
    runDetail: {
      title: 'Execution details',
      description:
        'Install the workflow-management Registry item for the editable management interface.',
    },
  },
};

export type WorkflowResource = LocaleResource<typeof enUS>;
export default enUS;
