import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  errors: {
    badRequest: 'The workflow request is invalid.',
    conflict: 'The workflow request conflicts with the current state.',
    serviceUnavailable: 'The workflow service is unavailable.',
    notConfigured: 'Workflow service is not configured.',
    internal: 'Internal server error.',
    enabledBoolean: 'enabled must be a boolean',
    workflowNotFound: 'The requested workflow was not found.',
    invalidInput: 'The workflow input is invalid.',
    parentRunNotFound: 'The parent workflow run was not found.',
    stackLimitExceeded: 'The workflow stack limit was exceeded.',
    inputTooLarge: 'The workflow input is too large.',
  },
};

export type WorkflowServerResource = LocaleResource<typeof enUS>;
export default enUS;
