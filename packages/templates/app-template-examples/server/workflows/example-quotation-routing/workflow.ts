import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Example: Quotation routing',
  description:
    'Calculate a quotation, route by an adjustable threshold, and inspect the shared final result. No orders are changed.',
  inputSchema: {
    type: 'object',
    required: ['quotationId', 'amountCents'],
    properties: {
      quotationId: {
        type: 'string',
        title: 'Quotation reference (try Q-100)',
        minLength: 1,
        maxLength: 64,
      },
      amountCents: {
        type: 'integer',
        title: 'Amount in cents (try 50000 or 150000)',
        minimum: 0,
        maximum: 100000000,
      },
    },
    additionalProperties: false,
  },
  parameters: {
    reviewThresholdCents: {
      type: 'number',
      title: 'Manual follow-up threshold in cents',
      default: 100000,
    },
  },
  nodes: [
    RunInstruction.create({
      key: 'calculate',
      title: 'Calculate quotation',
      config: {
        module: './server/calculate',
        args: {
          quotationId: '{{$input.quotationId}}',
          amountCents: '{{$input.amountCents}}',
        },
      },
      result: {
        type: 'object',
        properties: {
          quotationId: { type: 'string' },
          totalCents: { type: 'integer' },
        },
        required: ['quotationId', 'totalCents'],
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'needsFollowUp',
      title: 'At or above the review threshold?',
      config: {
        expression: {
          '>=': [
            { var: 'nodeResults.calculate.totalCents' },
            { var: 'parameters.reviewThresholdCents' },
          ],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'manualFollowUp',
          title: 'Flag for manual follow-up',
          config: {
            module: './server/record-route',
            args: {
              route: 'manual-follow-up',
              quotationId: '{{$input.quotationId}}',
            },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'standardRouting',
          title: 'Use standard processing',
          config: {
            module: './server/record-route',
            args: { route: 'standard', quotationId: '{{$input.quotationId}}' },
          },
        }),
      ],
    }),
    RunInstruction.create({
      key: 'summarize',
      title: 'Summarize selected route',
      config: {
        module: './server/summarize',
        args: {
          quotationId: '{{$nodeResults.calculate.quotationId}}',
          totalCents: '{{$nodeResults.calculate.totalCents}}',
          needsFollowUp: '{{$nodeResults.needsFollowUp}}',
        },
      },
    }),
  ],
});
export default workflow;
