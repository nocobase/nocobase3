import type { PermissionGrant } from '../../core/grants.js';
import type { AuthorizationTitle } from '../../core/titles.js';
import type { PermissionSet } from './model.js';

/** Builds Permission Set data without writing to a store. */
export class PermissionSetBuilder {
  private readonly definition: PermissionSet;

  constructor(definition: PermissionSet) {
    this.definition = structuredClone(definition);
  }

  title(title: AuthorizationTitle): PermissionSetBuilder {
    return new PermissionSetBuilder({ ...this.definition, title });
  }

  grant(...grants: readonly PermissionGrant[]): PermissionSetBuilder {
    return new PermissionSetBuilder({
      ...this.definition,
      grants: [...this.definition.grants, ...grants],
    });
  }

  build(): PermissionSet {
    return structuredClone(this.definition);
  }
}

export function definePermissionSet(key: string): PermissionSetBuilder {
  if (!key) throw new TypeError('A Permission Set needs a key');
  return new PermissionSetBuilder({ key, grants: [] });
}
