import {
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Application runtime probe',
  description:
    'Verifies that a Run node can access the application and call a registered runtime service.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'probeAppRuntime',
      title: 'Call the application ID generator',
      config: {
        module: './server/probe-app-runtime',
      },
      result: {
        type: 'object',
        required: ['available', 'appName', 'capability', 'generatedId'],
        properties: {
          available: { type: 'boolean' },
          appName: { type: 'string' },
          capability: { type: 'string' },
          generatedId: { type: 'string' },
        },
        additionalProperties: false,
      },
    }),
  ],
});

export default workflow;
