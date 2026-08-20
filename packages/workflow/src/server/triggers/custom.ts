import type { JsonObject, WorkflowTrigger } from '../types.js';

/**
 * `custom` — an event raised explicitly by application business logic.
 *
 * The trigger has no event-specific configuration. Calling the workflow
 * service is itself the event, so normal trigger validation only needs to
 * select workflows whose declared trigger type is `custom`.
 */
export const customTrigger: WorkflowTrigger = {
  validateConfig(config: JsonObject): Record<string, string> | null {
    const unknownKeys = Object.keys(config);
    return unknownKeys.length
      ? { config: `custom trigger does not accept config field(s): ${unknownKeys.join(', ')}` }
      : null;
  },
};

export default customTrigger;
