import { defineWorkflow, RunInstruction } from '@nocobase/app-plugin-workflow';

export default defineWorkflow({
  title: 'Broken quotation fixture',
  contextSchema: {
    type: 'object',
    properties: {
      quotationId: { type: 'string', format: 'uuid' },
    },
  },
  nodes: [
    RunInstruction.create({
      key: 'loadQuotation',
      config: { script: './server/load-quotation.ts' },
    }),
  ],
});
