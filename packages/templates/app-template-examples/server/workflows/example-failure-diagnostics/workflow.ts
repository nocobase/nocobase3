import {
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';
const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Example: Failure diagnostics',
  description:
    'Run with simulateFailure=true to inspect a deliberate error, then start a new run with false. No external side effects.',
  inputSchema: {
    type: 'object',
    required: ['reference', 'simulateFailure'],
    properties: {
      reference: {
        type: 'string',
        title: 'Reference (try DIAG-100)',
        minLength: 1,
        maxLength: 64,
      },
      simulateFailure: { type: 'boolean', title: 'Simulate a failure' },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'prepare',
      title: 'Prepare diagnostic input',
      config: {
        module: './server/prepare',
        args: { reference: '{{$input.reference}}' },
      },
    }),
    RunInstruction.create({
      key: 'execute',
      title: 'Execute controlled operation',
      config: {
        module: './server/execute',
        args: {
          reference: '{{$input.reference}}',
          simulateFailure: '{{$input.simulateFailure}}',
        },
      },
      result: {
        type: 'object',
        properties: {
          reference: { type: 'string' },
          completed: { type: 'boolean' },
        },
        required: ['reference', 'completed'],
        additionalProperties: false,
      },
    }),
    RunInstruction.create({
      key: 'finish',
      title: 'Record successful completion',
      config: {
        module: './server/finish',
        args: { result: '{{$nodeResults.execute}}' },
      },
    }),
  ],
});
export default workflow;
