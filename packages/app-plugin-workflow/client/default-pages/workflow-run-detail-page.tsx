import type { ReactElement } from 'react';

import { WorkflowFallbackPage } from './page-shell.js';

export default function WorkflowRunDetailPage(): ReactElement {
  return (
    <WorkflowFallbackPage
      description='Install the workflow-management Registry item to inspect this workflow execution.'
      title='Execution details'
    />
  );
}
