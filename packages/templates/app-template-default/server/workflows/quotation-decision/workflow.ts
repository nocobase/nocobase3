import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Quotation decision',
  description:
    'Calculates quotation risk, routes high-value quotations, and records the decision.',
  inputSchema: {
    type: 'object',
    required: ['quotationId', 'amount'],
    properties: {
      quotationId: { type: 'string', minLength: 1 },
      amount: { type: 'number', minimum: 0 },
    },
    additionalProperties: false,
  },
  parameters: {
    approvalLimit: {
      type: 'number',
      title: 'Approval limit',
      description: 'Quotations above this amount require manual approval.',
      default: 100000,
    },
    auditEnabled: {
      type: 'boolean',
      title: 'Enable audit logging',
      description: 'Whether to record audit details for this workflow.',
      default: true,
    },
  },
  nodes: [
    RunInstruction.create({
      key: 'calculateRisk',
      title: 'Calculate quotation risk',
      config: {
        module: './server/calculate-risk',
        args: {
          quotationId: '{{$input.quotationId}}',
          amount: '{{$input.amount}}',
        },
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
      title: 'Check approval requirement',
      config: {
        expression: {
          '>': [
            { var: 'nodeResults.calculateRisk.score' },
            { var: 'parameters.approvalLimit' },
          ],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'requestApproval',
          title: 'Request approval',
          config: {
            module: './server/request-approval',
            args: { quotationId: '{{$input.quotationId}}' },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'logNoApproval',
          title: 'Log quotation without approval',
          config: {
            module: './server/log-no-approval',
            args: { quotationId: '{{$input.quotationId}}' },
          },
        }),
      ],
    }),
    RunInstruction.create({
      key: 'recordDecision',
      title: 'Record quotation decision',
      config: {
        module: './server/record-decision',
        args: {
          quotationId: '{{$input.quotationId}}',
          needsApproval: '{{$nodeResults.needsApproval}}',
        },
      },
    }),
  ],
});

export default workflow;
