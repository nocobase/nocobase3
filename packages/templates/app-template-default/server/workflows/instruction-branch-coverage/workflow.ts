import {
  ConditionInstruction,
  defineWorkflow,
  RunInstruction,
  TerminateInstruction,
  type WorkflowSourceAst,
} from '@nocobase/app-plugin-workflow';

const workflow: WorkflowSourceAst = defineWorkflow({
  title: 'Instruction and branch coverage',
  description:
    'Exercises every registered workflow instruction and every supported condition branch shape without external side effects.',
  inputSchema: {
    type: 'object',
    required: ['caseId', 'primaryRoute', 'nestedRoute', 'termination'],
    properties: {
      caseId: { type: 'string', minLength: 1, maxLength: 128 },
      primaryRoute: { type: 'string', enum: ['yes', 'no'] },
      nestedRoute: { type: 'string', enum: ['yes', 'no'] },
      termination: {
        type: 'string',
        enum: ['continue', 'success', 'failure'],
      },
    },
    additionalProperties: false,
  },
  parameters: {
    suiteLabel: {
      type: 'string',
      title: 'Suite label',
      description: 'Label included in the side-effect-free test results.',
      default: 'workflow-instruction-coverage',
    },
  },
  nodes: [
    RunInstruction.create({
      key: 'initializeCoverage',
      title: 'Initialize coverage data',
      description:
        'Creates the baseline result used by later nodes, for example preserving the case ID and suite label for the yes-only branch.',
      config: {
        module: './server/record-step',
        args: {
          caseId: '{{$input.caseId}}',
          step: 'initialize',
          suiteLabel: '{{$parameters.suiteLabel}}',
        },
      },
      result: {
        type: 'object',
        required: ['caseId', 'step', 'suiteLabel'],
        properties: {
          caseId: { type: 'string' },
          step: { type: 'string' },
          suiteLabel: { type: 'string' },
        },
        additionalProperties: false,
      },
    }),
    ConditionInstruction.create({
      key: 'unbranchedCondition',
      title: 'Evaluate a condition without branches',
      description:
        'Demonstrates a condition node with no expression or branch definitions; execution simply continues to the next node.',
      config: {},
    }),
    ConditionInstruction.create({
      key: 'emptyBranches',
      title: 'Cover two empty branches',
      description:
        'Checks whether primaryRoute is "yes" while demonstrating that either selected branch may contain no nodes.',
      config: {
        expression: {
          '===': [{ var: 'input.primaryRoute' }, 'yes'],
        },
      },
    }).branch({ yes: [], no: [] }),
    ConditionInstruction.create({
      key: 'yesBranchOnly',
      title: 'Cover a populated yes branch',
      description:
        'Runs its child node only when primaryRoute is "yes"; the no branch is intentionally empty.',
      config: {
        expression: {
          '===': [{ var: 'input.primaryRoute' }, 'yes'],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'recordYesOnlyBranch',
          title: 'Record the yes-only branch',
          description:
            'Records the "yes-only" step using values returned by the initialization node.',
          config: {
            module: './server/record-step',
            args: {
              caseId: '{{$nodeResults.initializeCoverage.caseId}}',
              step: 'yes-only',
              suiteLabel: '{{$nodeResults.initializeCoverage.suiteLabel}}',
            },
          },
        }),
      ],
      no: [],
    }),
    ConditionInstruction.create({
      key: 'noBranchOnly',
      title: 'Cover a populated no branch',
      description:
        'Runs its child node when primaryRoute is not "yes"; the yes branch is intentionally empty.',
      config: {
        expression: {
          '===': [{ var: 'input.primaryRoute' }, 'yes'],
        },
      },
    }).branch({
      yes: [],
      no: [
        RunInstruction.create({
          key: 'recordNoOnlyBranch',
          title: 'Record the no-only branch',
          description:
            'Records the "no-only" step using the workflow input and parameter bindings.',
          config: {
            module: './server/record-step',
            args: {
              caseId: '{{$input.caseId}}',
              step: 'no-only',
              suiteLabel: '{{$parameters.suiteLabel}}',
            },
          },
        }),
      ],
    }),
    ConditionInstruction.create({
      key: 'twoPopulatedBranches',
      title: 'Cover two populated branches',
      description:
        'Selects one of two populated branches according to whether primaryRoute is "yes".',
      config: {
        expression: {
          '===': [{ var: 'input.primaryRoute' }, 'yes'],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'recordPopulatedYesBranch',
          title: 'Record the populated yes branch',
          description:
            'Records the "populated-yes" step when the two-branch condition evaluates to true.',
          config: {
            module: './server/record-step',
            args: {
              caseId: '{{$input.caseId}}',
              step: 'populated-yes',
              suiteLabel: '{{$parameters.suiteLabel}}',
            },
          },
        }),
        RunInstruction.create({
          key: 'recordPopulatedYesSuccessor',
          title: 'Continue inside the populated yes branch',
          description:
            'Verifies that a second node in the yes branch runs before returning to the parent sequence.',
          config: {
            module: './server/record-step',
            args: {
              caseId: '{{$nodeResults.initializeCoverage.caseId}}',
              step: 'populated-yes-successor',
              suiteLabel: '{{$nodeResults.initializeCoverage.suiteLabel}}',
            },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'recordPopulatedNoBranch',
          title: 'Record the populated no branch',
          description:
            'Records the "populated-no" step when the two-branch condition evaluates to false.',
          config: {
            module: './server/record-step',
            args: {
              caseId: '{{$input.caseId}}',
              step: 'populated-no',
              suiteLabel: '{{$parameters.suiteLabel}}',
            },
          },
        }),
        RunInstruction.create({
          key: 'recordPopulatedNoSuccessor',
          title: 'Continue inside the populated no branch',
          description:
            'Verifies that a second node in the no branch runs before returning to the parent sequence.',
          config: {
            module: './server/record-step',
            args: {
              caseId: '{{$nodeResults.initializeCoverage.caseId}}',
              step: 'populated-no-successor',
              suiteLabel: '{{$nodeResults.initializeCoverage.suiteLabel}}',
            },
          },
        }),
      ],
    }),
    ConditionInstruction.create({
      key: 'outerNestedBranch',
      title: 'Select the outer nested branch',
      description:
        'Enters the nested condition when primaryRoute is "yes"; otherwise it records the outer no branch.',
      config: {
        expression: {
          '===': [{ var: 'input.primaryRoute' }, 'yes'],
        },
      },
    }).branch({
      yes: [
        ConditionInstruction.create({
          key: 'innerNestedBranch',
          title: 'Select the inner nested branch',
          description:
            'Within the outer yes branch, selects a child step according to whether nestedRoute is "yes".',
          config: {
            expression: {
              '===': [{ var: 'input.nestedRoute' }, 'yes'],
            },
          },
        }).branch({
          yes: [
            RunInstruction.create({
              key: 'recordNestedYesBranch',
              title: 'Record the nested yes branch',
              description:
                'Records the "nested-yes" step when both primaryRoute and nestedRoute are "yes".',
              config: {
                module: './server/record-step',
                args: {
                  caseId: '{{$input.caseId}}',
                  step: 'nested-yes',
                  suiteLabel: '{{$parameters.suiteLabel}}',
                },
              },
            }),
          ],
          no: [
            RunInstruction.create({
              key: 'recordNestedNoBranch',
              title: 'Record the nested no branch',
              description:
                'Records the "nested-no" step when primaryRoute is "yes" and nestedRoute is "no".',
              config: {
                module: './server/record-step',
                args: {
                  caseId: '{{$input.caseId}}',
                  step: 'nested-no',
                  suiteLabel: '{{$parameters.suiteLabel}}',
                },
              },
            }),
          ],
        }),
        RunInstruction.create({
          key: 'recordNestedSuccessor',
          title: 'Continue after the inner branch',
          description:
            'Verifies that both inner routes return to the outer yes branch before it rejoins the main sequence.',
          config: {
            module: './server/record-step',
            args: {
              caseId: '{{$nodeResults.initializeCoverage.caseId}}',
              step: 'nested-successor',
              suiteLabel: '{{$nodeResults.initializeCoverage.suiteLabel}}',
            },
          },
        }),
      ],
      no: [
        RunInstruction.create({
          key: 'recordOuterNoBranch',
          title: 'Record the outer no branch',
          description:
            'Records the "outer-no" step when primaryRoute is "no", without evaluating the nested condition.',
          config: {
            module: './server/record-step',
            args: {
              caseId: '{{$input.caseId}}',
              step: 'outer-no',
              suiteLabel: '{{$parameters.suiteLabel}}',
            },
          },
        }),
      ],
    }),
    ConditionInstruction.create({
      key: 'shouldTerminate',
      title: 'Select termination behavior',
      description:
        'Enters explicit termination handling when termination is "success" or "failure"; "continue" follows the natural completion path.',
      config: {
        expression: {
          '!==': [{ var: 'input.termination' }, 'continue'],
        },
      },
    }).branch({
      yes: [
        RunInstruction.create({
          key: 'recordTerminationRequest',
          title: 'Record the requested termination outcome',
          description:
            'Records the requested success or failure outcome before terminating, verifying that the new branch node runs before either terminal node.',
          config: {
            module: './server/record-step',
            args: {
              caseId: '{{$nodeResults.initializeCoverage.caseId}}',
              step: 'termination-request={{$input.termination}}',
              suiteLabel: '{{$nodeResults.initializeCoverage.suiteLabel}}',
            },
          },
        }),
        ConditionInstruction.create({
          key: 'shouldTerminateWithFailure',
          title: 'Select success or failure outcome',
          description:
            'Chooses a failure outcome when termination is "failure" and a success outcome otherwise.',
          config: {
            expression: {
              '===': [{ var: 'input.termination' }, 'failure'],
            },
          },
        }).branch({
          yes: [
            TerminateInstruction.create({
              key: 'terminateWithFailure',
              title: 'Terminate with failure outcome',
              description:
                'Stops the workflow immediately with a failure outcome, so subsequent nodes are not executed.',
              config: { outcome: 'failure' },
            }),
          ],
          no: [
            TerminateInstruction.create({
              key: 'terminateWithSuccess',
              title: 'Terminate with success outcome',
              description:
                'Stops the workflow immediately with a success outcome, so subsequent nodes are not executed.',
              config: { outcome: 'success' },
            }),
          ],
        }),
      ],
      no: [],
    }),
    RunInstruction.create({
      key: 'recordConditionResults',
      title: 'Record upstream condition results',
      description:
        'Records upstream condition results only on natural completion; explicit success or failure termination skips this moved node.',
      config: {
        module: './server/record-step',
        args: {
          caseId: '{{$nodeResults.initializeCoverage.caseId}}',
          step: 'primary={{$nodeResults.twoPopulatedBranches}}; nested-entry={{$nodeResults.outerNestedBranch}}',
          suiteLabel: '{{$nodeResults.initializeCoverage.suiteLabel}}',
        },
      },
    }),
    RunInstruction.create({
      key: 'recordNaturalCompletion',
      title: 'Record natural completion',
      description:
        'Records the final step only when termination is "continue" and the workflow reaches its natural end.',
      config: {
        module: './server/record-step',
        args: {
          caseId: '{{$input.caseId}}',
          step: 'natural-completion',
          suiteLabel: '{{$parameters.suiteLabel}}',
        },
      },
    }),
  ],
});

export default workflow;
