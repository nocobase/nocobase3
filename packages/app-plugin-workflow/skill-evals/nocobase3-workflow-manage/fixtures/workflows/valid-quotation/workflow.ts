import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
} from '@nocobase/app-plugin-workflow';

export default defineWorkflow({
  title: 'Fixture quotation decision',
  contextSchema: {
    type: 'object',
    required: ['quotationId', 'amount'],
    properties: {
      quotationId: { type: 'string', minLength: 1 },
      amount: { type: 'number', minimum: 0 },
    },
    additionalProperties: false,
  },
  inputs: {
    approvalLimit: { type: 'number', default: 100000 },
  },
  nodes: [
    RunInstruction.create({
      key: 'calculateRisk',
      config: {
        script: './server/calculate-risk.ts',
        args: { amount: '{{$context.amount}}' },
      },
      result: {
        type: 'object',
        required: ['score'],
        properties: { score: { type: 'number' } },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'needsApproval',
      config: {
        expression: {
          '>': [
            { var: 'nodeResults.calculateRisk.score' },
            { var: 'input.approvalLimit' },
          ],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'requestApproval',
          config: { script: './server/request-approval.ts' },
        }),
      ],
      no: [],
    }),
    RunInstruction.create({
      key: 'recordDecision',
      config: { script: './server/record-decision.ts' },
    }),
  ],
});
