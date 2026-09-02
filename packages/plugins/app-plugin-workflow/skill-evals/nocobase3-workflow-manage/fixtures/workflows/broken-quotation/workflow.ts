import { defineWorkflow, RunInstruction } from '@nocobase/app-plugin-workflow';

export default defineWorkflow({
  title: 'Broken quotation fixture',
  inputSchema: {
    type: 'object',
    properties: {
      quotationId: { type: 'string', format: 'uuid' },
    },
  },
  nodes: [
    RunInstruction.create({
      key: 'loadQuotation',
      config: { module: './server/load-quotation' },
    }),
  ],
});
