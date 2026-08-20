import type { WorkflowTrigger } from '../types.js';
import { customTrigger } from './custom.js';

/**
 * Identity helper that pins a trigger to the `WorkflowTrigger` shape at the
 * definition site.
 */
export function defineTrigger(trigger: WorkflowTrigger): WorkflowTrigger {
  return trigger;
}

/** Trigger types of the first version. */
export const TRIGGER_TYPES = {
  custom: 'custom',
} as const;

export type TriggerType = (typeof TRIGGER_TYPES)[keyof typeof TRIGGER_TYPES];

export const coreTriggers: ReadonlyMap<string, WorkflowTrigger> = new Map<string, WorkflowTrigger>([
  [TRIGGER_TYPES.custom, customTrigger],
]);

export { customTrigger, default as custom } from './custom.js';
