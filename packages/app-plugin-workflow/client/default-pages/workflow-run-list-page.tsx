import type { ReactElement } from 'react';

import { WorkflowFallbackPage } from './page-shell.js';

export default function WorkflowRunListPage(): ReactElement {
  return (
    <WorkflowFallbackPage
      description='Install the workflow-management Registry item for execution inspection and operational controls.'
      title='Execution records'
    />
  );
}
