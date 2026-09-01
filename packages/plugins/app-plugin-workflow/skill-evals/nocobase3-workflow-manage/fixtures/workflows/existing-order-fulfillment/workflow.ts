import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
} from '@nocobase/app-plugin-workflow';

export default defineWorkflow({
  title: 'Existing order fulfillment',
  inputSchema: {
    type: 'object',
    required: ['orderId'],
    properties: {
      orderId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'loadOrder',
      config: {
        script: './server/load-order.ts',
        args: { orderId: '{{$input.orderId}}' },
      },
      result: {
        type: 'object',
        required: ['inStock'],
        properties: { inStock: { type: 'boolean' } },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'hasStock',
      config: {
        expression: { var: 'nodeResults.loadOrder.inStock' },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'reserveInventory',
          config: {
            script: './server/reserve-inventory.ts',
            args: { orderId: '{{$input.orderId}}' },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'markBackorder',
          config: {
            script: './server/mark-backorder.ts',
            args: { orderId: '{{$input.orderId}}' },
          },
        }),
      ],
    }),
    RunInstruction.create({
      key: 'recordOutcome',
      config: {
        script: './server/record-outcome.ts',
        args: { orderId: '{{$input.orderId}}' },
      },
    }),
  ],
});
