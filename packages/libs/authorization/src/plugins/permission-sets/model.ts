import type { AuthorizationPolicy, ResourceRef } from '../../core/index.js';

export interface PermissionGrantAction {
  action: string;
  policy?: AuthorizationPolicy;
}

export interface PermissionGrant {
  resource: ResourceRef;
  actions: readonly PermissionGrantAction[];
}

export interface PermissionSet {
  key: string;
  title?: string;
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
