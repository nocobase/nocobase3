import type {
  AccessConstraintValue,
  AuthorizationSubject,
  ResourceRef,
} from '../../core/index.js';

export interface RestrictionRule {
  key: string;
  title?: string;
  resource: ResourceRef;
  actions: readonly string[];
  subjects: readonly AuthorizationSubject[];
  scope: AccessConstraintValue;
  reason?: string;
}
