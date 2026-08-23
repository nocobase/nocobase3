export * from './collections/index.js';
export * from './migration.js';
export * from './server/index.js';
import { ConditionInstruction } from './server/instructions/condition.js';
import { RunInstruction } from './server/instructions/run.js';
export const condition: typeof ConditionInstruction.create = ConditionInstruction.create.bind(ConditionInstruction);
export const run: typeof RunInstruction.create = RunInstruction.create.bind(RunInstruction);
export { compileToFlatIr, createNodeExpression, defineWorkflow, restoreFromFlatIr } from './workflow-source/core.js';
export type {
  AnyNodeExpression,
  BaseNodeExpression,
  BranchingNodeExpression,
  ConfigIssue,
  JSONSchema,
  NodeResultSchema,
  NodeResultSchemaBase,
  NodeResultNullSchema,
  NodeResultBooleanSchema,
  NodeResultNumberSchema,
  NodeResultStringSchema,
  NodeResultArraySchema,
  NodeResultObjectSchema,
  NodeResultUnionSchema,
  NodeExpression,
  NodeSourceAst,
  WorkflowFlatIr,
  WorkflowFlatNode,
  WorkflowNodeOptions,
  WorkflowNodeSourceInput,
  WorkflowSourceAst,
  WorkflowSourceInput,
} from './workflow-source/core.js';
