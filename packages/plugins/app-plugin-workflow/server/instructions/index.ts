export * from './base.js';
import type { WorkflowInstructionClass } from './base.js';
import { ConditionInstruction } from './condition/instruction.js';
import { RunInstruction } from './run/instruction.js';

export const INSTRUCTION_TYPES: {
  readonly condition: 'condition';
  readonly run: 'run';
} = {
  condition: 'condition',
  run: 'run',
};

export type InstructionType =
  (typeof INSTRUCTION_TYPES)[keyof typeof INSTRUCTION_TYPES];

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
  RunInstruction,
  validateRunConfig,
} from './run/instruction.js';
export type {
  RunConfig,
  WorkflowRunArgs,
  WorkflowRunFunction,
  WorkflowRunJsonValue,
  WorkflowRunModule,
  WorkflowRunRuntime,
} from './run/instruction.js';
export * from './condition/json-logic/index.js';

export * from './definition.js';
export * from './types.js';
