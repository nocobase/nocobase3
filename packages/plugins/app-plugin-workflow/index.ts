export {
  ConditionInstruction,
  TERMINATE_OUTCOMES,
  TerminateInstruction,
  RunInstruction,
} from './server/instructions/index.js';
export type {
  TerminateConfig,
  TerminateOutcome,
} from './server/instructions/terminate/instruction.js';

export {
  compileToFlatIr,
  createNodeExpression,
  defineWorkflow,
  restoreFromFlatIr,
} from './server/instructions/definition.js';
export type * from './server/instructions/types.js';
export type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from './server/instructions/run/instruction.js';
