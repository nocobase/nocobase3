import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Customer onboarding',
  description:
    'Validates a customer profile and records whether onboarding can proceed.',
  inputSchema: {
    type: 'object',
    required: ['customerId', 'name', 'email'],
    properties: {
      customerId: { type: 'string', minLength: 1 },
      name: { type: 'string' },
      email: { type: 'string' },
    },
    additionalProperties: false,
  },
  nodes: [
    RunInstruction.create({
      key: 'validateProfile',
      title: 'Validate customer profile',
      config: {
        module: './server/validate-profile',
        args: {
          customerId: '{{$input.customerId}}',
          name: '{{$input.name}}',
          email: '{{$input.email}}',
        },
      },
      result: {
        type: 'object',
        required: ['complete', 'missingFields'],
        properties: {
          complete: { type: 'boolean' },
          missingFields: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'profileComplete',
      title: 'Check profile completeness',
      config: {
        expression: {
          '===': [{ var: 'nodeResults.validateProfile.complete' }, true],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'recordOnboardingReady',
          title: 'Record onboarding readiness',
          config: {
            module: './server/record-onboarding-ready',
            args: { customerId: '{{$input.customerId}}' },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'recordOnboardingRejected',
          title: 'Record onboarding rejection',
          config: {
            module: './server/record-onboarding-rejected',
            args: {
              customerId: '{{$input.customerId}}',
              missingFields: '{{$nodeResults.validateProfile.missingFields}}',
            },
          },
        }),
      ],
    }),
  ],
});

export default workflow;
