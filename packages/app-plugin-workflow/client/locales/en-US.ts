/**
 * The shape every locale of this plugin follows. English is the source of truth: a key exists here first, and a
 * locale that omits it falls back rather than breaking.
 */
export interface WorkflowResource {
  readonly nav: {
    readonly workflow: string;
    readonly workflows: string;
    readonly runs: string;
  };
  readonly pages: {
    readonly list: { readonly title: string; readonly description: string };
    readonly detail: { readonly title: string; readonly description: string };
    readonly runList: { readonly title: string; readonly description: string };
    readonly runDetail: {
      readonly title: string;
      readonly description: string;
    };
  };
}

const enUS: WorkflowResource = {
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

export default enUS;
