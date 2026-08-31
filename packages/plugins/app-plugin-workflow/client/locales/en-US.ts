import type { LocaleResource } from '@nocobase/app-i18n';

const enUS = {
  nav: {
    workflow: 'Workflow',
    workflows: 'Workflows',
    runs: 'Execution records',
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

/**
 * The shape every locale of this plugin follows, derived from the English wording above.
 *
 * English is the source of truth: a key exists here first, and a locale annotated with this type reports both a
 * missing key and one that does not exist here at all.
 */
export type WorkflowResource = LocaleResource<typeof enUS>;

export default enUS;
