import type { WorkflowInstruction } from '@nocobase/workflow';

/** Application-owned instruction registrations layered on top of workflow core. */
export const appWorkflowInstructions: Map<string, WorkflowInstruction> = new Map<string, WorkflowInstruction>();
