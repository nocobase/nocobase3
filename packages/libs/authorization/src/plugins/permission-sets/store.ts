import type {
  PermissionSet,
  PermissionSetAssignment,
  PermissionSetSubject,
} from './model.js';

export interface PermissionSetStore<TTransaction = unknown> {
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
  /**
   * Serializes concurrent changes to one Permission Set. A store without
   * transactions may do nothing.
   */
  lock?(key: string): Promise<void>;
  /**
   * Returns a store bound to the caller's transaction. The caller opens and
   * commits the transaction; a store without transactions returns itself.
   */
  withTransaction(transaction: TTransaction): PermissionSetStore<TTransaction>;
}
