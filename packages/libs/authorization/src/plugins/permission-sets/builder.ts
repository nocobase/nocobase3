import type { AuthorizationTitle } from '../../core/titles.js';
import type { PermissionGrant, PermissionSet } from './model.js';

/** Build permission-set data without writing to a store. */
export class PermissionSetBuilder {
  constructor(private readonly definition: PermissionSet) {}
  title(title: AuthorizationTitle): PermissionSetBuilder {
    return new PermissionSetBuilder({ ...this.definition, title });
  }
  grant(...grants: readonly PermissionGrant[]): PermissionSetBuilder {
    return new PermissionSetBuilder({
      ...this.definition,
      grants: [...this.definition.grants, ...structuredClone(grants)],
    });
  }
  build(): PermissionSet {
    return structuredClone(this.definition);
  }
}
export function permissionSet(key: string): PermissionSetBuilder {
  if (!key) throw new TypeError('A permission set needs a key');
  return new PermissionSetBuilder({ key, grants: [] });
}
