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
  selection: SharingSelection;
}

export interface SharingRule {
  key: string;
  title?: string;
  resource: ResourceRef;
  actions: readonly SharingRuleAction[];
  subjects: readonly AuthorizationSubject[];
  reason?: string;
}
