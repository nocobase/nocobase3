import type { AuthorizationTitle } from '../../core/titles.js';
import type {
  AccessConstraintValue,
  AuthorizationSubject,
  ResourceRef,
} from '../../core/index.js';

export interface RestrictionRule {
  key: string;
  title?: AuthorizationTitle;
  resource: ResourceRef;
  actions: readonly RestrictionRuleAction[];
  subjects: readonly AuthorizationSubject[];
  reason?: string;
}

export interface RestrictionRuleAction {
  action: string;
  scopeKey?: string;
  scope: AccessConstraintValue;
}
