import type { WorkflowInstruction } from '../types.js';
import { unboundRunModuleResolver } from '../run-module-resolver.js';
import { conditionInstruction } from './condition.js';
import { createRunInstruction } from './run.js';

/**
 * Identity helper that pins an instruction to the `WorkflowInstruction` shape
 * at the definition site, so a wrong `run` / `resume` signature is reported in
 * the file that owns it instead of in the registry that consumes it.
 */
export function defineInstruction(instruction: WorkflowInstruction): WorkflowInstruction {
  return instruction;
}

/** Node types of the first version. */
export const INSTRUCTION_TYPES = {
  condition: 'condition',
  run: 'run',
} as const;

export type InstructionType = (typeof INSTRUCTION_TYPES)[keyof typeof INSTRUCTION_TYPES];

/**
 * Core node instructions available to every runtime.
 *
 * The core `run` instruction uses the production-safe unbound resolver. An
 * application that has a workflow artifact resolver layers its configured
 * `run` instruction on top of this entry under the same key.
 */
export const runInstruction: WorkflowInstruction = createRunInstruction({
  resolver: unboundRunModuleResolver,
  app: undefined,
});

export const coreInstructions: ReadonlyMap<string, WorkflowInstruction> = new Map<string, WorkflowInstruction>([
  [INSTRUCTION_TYPES.condition, conditionInstruction],
  [INSTRUCTION_TYPES.run, runInstruction],
]);

export { conditionInstruction, default as condition } from './condition.js';
export {
  CONDITION_BRANCH_KEYS,
  CONDITION_COMPARATORS,
  evaluateConditionCalculation,
  validateConditionConfig,
} from './condition.js';
export type {
  ConditionBranchKey,
  ConditionCalculation,
  ConditionComparator,
  ConditionComparison,
  ConditionConfig,
  ConditionGroup,
} from './condition.js';
