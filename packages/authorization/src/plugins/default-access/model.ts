import type { AccessConstraintValue, ResourceRef } from '../../core/index.js';

export interface DefaultAccessRule {
  resource: ResourceRef;
  actions: readonly string[];
  scope: AccessConstraintValue;
}
