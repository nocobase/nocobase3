import type { RuleAction } from '../../core/constraints.js';
import type { ResourceRef } from '../../core/types.js';

/** Records every identity reaches for an action, in addition to its grants. */
export interface DefaultAccessRule {
  key: string;
  resource: ResourceRef;
  actions: readonly RuleAction[];
}
