import type { AccessConstraintValue, ResourceRef } from '../../core/index.js';

export interface DefaultAccessRule {
  resource: ResourceRef;
  actions: readonly DefaultAccessAction[];
}

export interface DefaultAccessAction {
  action: string;
  scope: AccessConstraintValue;
}
