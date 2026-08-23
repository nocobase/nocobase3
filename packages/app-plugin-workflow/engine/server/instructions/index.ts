import type { WorkflowInstructionClass } from '../types.js';
import { unboundRunModuleResolver } from '../run-module-resolver.js';
import { ConditionInstruction } from './condition.js';
import { createRunInstruction } from './run.js';

export const INSTRUCTION_TYPES: {
  readonly condition: 'condition';
  readonly run: 'run';
} = {
  condition: 'condition',
  run: 'run',
};

export type InstructionType =
  (typeof INSTRUCTION_TYPES)[keyof typeof INSTRUCTION_TYPES];

export const RunInstruction: WorkflowInstructionClass = createRunInstruction({
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
} from './condition.js';
export type { ConditionBranchKey, ConditionConfig } from './condition.js';
