import type {
  AccessConstraintValue,
  AuthorizationSubject,
  ResourceRef,
} from '../../core/index.js';

export interface RestrictionRule {
  key: string;
  title?: string;
  resource: ResourceRef;
  actions: readonly RestrictionRuleAction[];
  subjects: readonly AuthorizationSubject[];
  reason?: string;
}

export interface RestrictionRuleAction {
  action: string;
  scope: AccessConstraintValue;
}
