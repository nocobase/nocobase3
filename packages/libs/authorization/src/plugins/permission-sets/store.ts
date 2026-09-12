import type {
  PermissionSet,
  PermissionSetAssignment,
  PermissionSetSubject,
} from './model.js';

export interface PermissionSetStore {
  listPermissionSets(): Promise<readonly PermissionSet[]>;
  findAssignments(
    subjects: readonly PermissionSetSubject[],
  ): Promise<readonly PermissionSetAssignment[]>;
  getPermissionSet(key: string): Promise<PermissionSet | undefined>;
  createPermissionSet(input: PermissionSet): Promise<PermissionSet>;
  updatePermissionSet(
    key: string,
    input: PermissionSet,
  ): Promise<PermissionSet>;
  deletePermissionSet(key: string): Promise<void>;
  assignPermissionSet(
    input: PermissionSetAssignment,
  ): Promise<PermissionSetAssignment>;
  revokeAssignment(id: string): Promise<void>;
  listAssignments(
    permissionSet?: string,
  ): Promise<readonly PermissionSetAssignment[]>;
}
