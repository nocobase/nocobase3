import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Inventory replenishment',
  description:
    'Calculates an inventory shortage and records a replenishment recommendation.',
  inputSchema: {
    type: 'object',
    required: ['sku', 'stockLevel', 'reorderPoint'],
    properties: {
      sku: { type: 'string', minLength: 1 },
      stockLevel: { type: 'integer', minimum: 0 },
      reorderPoint: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
  parameters: {
    targetMultiplier: {
      type: 'number',
      title: 'Target stock multiplier',
      description: 'Multiplier applied to the reorder point for target stock.',
      default: 2,
    },
  },
  nodes: [
    RunInstruction.create({
      key: 'calculateShortage',
      title: 'Calculate inventory shortage',
      config: {
        module: './server/calculate-shortage',
        args: {
          stockLevel: '{{$input.stockLevel}}',
          reorderPoint: '{{$input.reorderPoint}}',
          targetMultiplier: '{{$parameters.targetMultiplier}}',
        },
      },
      result: {
        type: 'object',
        required: ['reorderRequired', 'recommendedQuantity'],
        properties: {
          reorderRequired: { type: 'boolean' },
          recommendedQuantity: { type: 'integer' },
        },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'needsReplenishment',
      title: 'Check replenishment requirement',
      config: {
        expression: {
          '===': [
            { var: 'nodeResults.calculateShortage.reorderRequired' },
            true,
          ],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'recordReplenishment',
          title: 'Record replenishment recommendation',
          config: {
            module: './server/record-replenishment',
            args: {
              sku: '{{$input.sku}}',
              quantity:
                '{{$nodeResults.calculateShortage.recommendedQuantity}}',
            },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'recordStockSufficient',
          title: 'Record sufficient stock',
          config: {
            module: './server/record-stock-sufficient',
            args: { sku: '{{$input.sku}}' },
          },
        }),
      ],
    }),
  ],
});

export default workflow;
