import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

const bootstrap: AppClientPluginBootstrap = ({ refine }) => {
  refine.addResources([
    {
      name: 'workflow',
      meta: { label: 'Workflow' },
    },
    {
      name: 'workflow.workflows',
      list: '/workflow/workflows',
      meta: { label: 'Workflows', parent: 'workflow' },
    },
    {
      name: 'workflow.runs',
      list: '/workflow/runs',
      meta: { label: 'Execution records', parent: 'workflow' },
    },
  ]);
};

export default bootstrap;
