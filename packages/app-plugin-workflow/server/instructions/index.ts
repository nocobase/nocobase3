export * from './base.js';
import type { WorkflowInstructionClass } from './base.js';
import { unboundRunModuleResolver } from '../loader/module-resolver.js';
import { ConditionInstruction } from './condition/instruction.js';
import {
  createRunInstruction,
  RunInstruction as BaseRunInstruction,
} from './run/instruction.js';

export const INSTRUCTION_TYPES: {
  readonly condition: 'condition';
  readonly run: 'run';
} = {
  condition: 'condition',
  run: 'run',
};

export type InstructionType =
  (typeof INSTRUCTION_TYPES)[keyof typeof INSTRUCTION_TYPES];

export const RunInstruction: typeof BaseRunInstruction = createRunInstruction({
  resolver: unboundRunModuleResolver,
  app: undefined,
});

export const coreInstructions: ReadonlyMap<string, WorkflowInstructionClass> =
  new Map<string, WorkflowInstructionClass>([
    [ConditionInstruction.type, ConditionInstruction],
    [RunInstruction.type, RunInstruction],
  ]);

export {
  ConditionInstruction,
  CONDITION_BRANCH_KEYS,
  validateConditionConfig,
} from './condition/instruction.js';
export type {
  ConditionBranchKey,
  ConditionConfig,
} from './condition/instruction.js';

export {
  assertWorkflowRunResult,
  createRunInstruction,
  validateRunConfig,
} from './run/instruction.js';
export type {
  RunConfig,
  RunInstructionOptions,
  WorkflowRunArgs,
  WorkflowRunFunction,
  WorkflowRunJsonValue,
  WorkflowRunModule,
  WorkflowRunModuleRequest,
  WorkflowRunModuleResolver,
  WorkflowRunRuntime,
} from './run/instruction.js';
export * from './condition/json-logic/index.js';

export * from './definition.js';
export * from './types.js';
