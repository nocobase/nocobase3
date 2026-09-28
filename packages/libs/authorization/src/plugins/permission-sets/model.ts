import type { PermissionGrant } from '../../core/grants.js';
import type { AuthorizationTitle } from '../../core/titles.js';

export interface PermissionSet {
  key: string;
  title?: AuthorizationTitle;
  grants: readonly PermissionGrant[];
}

export interface PermissionSetSubject {
  type: string;
  id: string;
}

export interface PermissionSetAssignment {
  id: string;
  subject: PermissionSetSubject;
  permissionSet: string;
}
