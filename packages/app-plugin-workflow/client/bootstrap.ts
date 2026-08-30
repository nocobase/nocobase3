import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';

import { WORKFLOW_NS } from './namespace.js';

// Resources are registered once at bootstrap, long before a language is chosen, so a label cannot be translated
// here. It carries the key and the namespace instead, and the navigation translates it as it renders.
const bootstrap: AppClientPluginBootstrap = ({ refine }) => {
  refine.addResources([
    {
      name: 'workflow',
      meta: { label: 'nav.workflow', i18nNs: WORKFLOW_NS },
    },
    {
      name: 'workflow.workflows',
      list: '/workflow/workflows',
      meta: { label: 'nav.workflows', i18nNs: WORKFLOW_NS, parent: 'workflow' },
    },
    {
      name: 'workflow.runs',
      list: '/workflow/runs',
      meta: { label: 'nav.runs', i18nNs: WORKFLOW_NS, parent: 'workflow' },
    },
  ]);
};

export default bootstrap;
