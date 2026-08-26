import type { ReactElement } from 'react';

import { WorkflowFallbackPage } from './page-shell.js';

export default function WorkflowDetailPage(): ReactElement {
  return (
    <WorkflowFallbackPage
      description='Install the workflow-management Registry item to inspect this workflow definition.'
      title='Workflow details'
    />
  );
}
