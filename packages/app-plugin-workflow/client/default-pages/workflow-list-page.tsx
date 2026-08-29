import type { ReactElement } from 'react';

import { WorkflowFallbackPage } from './page-shell.js';

export default function WorkflowListPage(): ReactElement {
  return (
    <WorkflowFallbackPage
      description='Install the workflow-management Registry item for the editable management interface.'
      title='Workflows'
    />
  );
}
