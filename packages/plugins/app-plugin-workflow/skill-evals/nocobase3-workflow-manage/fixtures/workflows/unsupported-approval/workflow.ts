import {
  ApprovalInstruction,
  defineWorkflow,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Unsupported approval fixture',
  nodes: [
    ApprovalInstruction.create({
      key: 'managerApproval',
      config: { assignee: 'manager' },
    }),
  ],
});

export default workflow;
