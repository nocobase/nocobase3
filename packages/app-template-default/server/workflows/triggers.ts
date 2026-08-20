import type { WorkflowTrigger } from '@nocobase/workflow';

/** Application-owned trigger registrations layered on top of workflow core. */
export const appWorkflowTriggers: Map<string, WorkflowTrigger> = new Map<string, WorkflowTrigger>();
