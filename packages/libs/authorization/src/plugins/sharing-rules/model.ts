import type { AuthorizationTitle } from '../../core/titles.js';
import type {
  AccessConstraintValue,
  AuthorizationSubject,
  ResourceRef,
} from '../../core/index.js';

export type SharingSelection =
  | { type: 'records'; ids: readonly string[] }
  | { type: 'policy'; policy: AccessConstraintValue };

export interface SharingRuleAction {
  action: string;
  scopeKey?: string;
  selection: SharingSelection;
}

export interface SharingRule {
  key: string;
  title?: AuthorizationTitle;
  resource: ResourceRef;
  actions: readonly SharingRuleAction[];
  subjects: readonly AuthorizationSubject[];
  reason?: string;
}
