import {
  ApprovalInstruction,
  defineWorkflow,
} from '@nocobase/app-plugin-workflow';

export default defineWorkflow({
  title: 'Unsupported approval fixture',
  nodes: [
    ApprovalInstruction.create({
      key: 'managerApproval',
      config: { assignee: 'manager' },
    }),
  ],
});
