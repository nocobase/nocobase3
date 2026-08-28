export {
  ConditionInstruction,
  RunInstruction,
} from './server/instructions/index.js';

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
