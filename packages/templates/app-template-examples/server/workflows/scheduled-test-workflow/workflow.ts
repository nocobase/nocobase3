import {
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Scheduled test workflow',
  description:
    'A test workflow invoked by the five-minute scheduled task; it waits five seconds before completing.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'waitFiveSeconds',
      title: 'Wait five seconds',
      config: {
        module: './server/wait-five-seconds',
      },
      result: {
        type: 'object',
        required: ['waitedMs', 'completedAt'],
        properties: {
          waitedMs: { type: 'integer' },
          completedAt: { type: 'string' },
        },
        additionalProperties: false,
      },
    }),
  ],
});

export default workflow;
