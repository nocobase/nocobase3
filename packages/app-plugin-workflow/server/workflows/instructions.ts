import type { WorkflowInstructionClass } from '../../engine/index.js';

/** Application-owned instruction registrations layered on top of workflow core. */
export const appWorkflowInstructions: Map<string, WorkflowInstructionClass> =
  new Map<string, WorkflowInstructionClass>();
