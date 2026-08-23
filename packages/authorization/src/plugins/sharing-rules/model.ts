import type {
  AccessConstraintValue,
  AuthorizationSubject,
  ResourceRef,
} from '../../core/index.js';

export type SharingSelection =
  | { type: 'records'; recordIds: readonly string[] }
  | { type: 'criteria'; scope: AccessConstraintValue };

export interface SharingRule {
  key: string;
  title?: string;
  resource: ResourceRef;
  actions: readonly string[];
  subjects: readonly AuthorizationSubject[];
  selection: SharingSelection;
  reason?: string;
}
