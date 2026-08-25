import type {
  Assignment,
  OrganizationWideDefault,
  PermissionSet,
  PermissionSetGroup,
  PolicyDefinition,
  ResourceDefinition,
  RestrictionRule,
  SharingRule,
} from './types.js';

/** Serializable metadata for a registered policy. The executable compiler stays in the runtime registry. */
export type PolicyDescriptor = Omit<PolicyDefinition, 'compile'> & {
  paramsSchema?: unknown;
};

/** Runtime capabilities available to business authorization definitions. */
export interface AuthorizationCatalog {
  resources: readonly ResourceDefinition[];
  policies: readonly PolicyDescriptor[];
}

/** The canonical, serializable business authorization configuration. */
export interface AuthorizationDefinition {
  permissionSets: readonly PermissionSet[];
  permissionSetGroups: readonly PermissionSetGroup[];
  assignments: readonly Assignment[];
  organizationWideDefaults: Readonly<Record<string, OrganizationWideDefault>>;
  sharingRules: readonly SharingRule[];
  restrictionRules: readonly RestrictionRule[];
}

export type AuthorizationDefinitionInput = Partial<AuthorizationDefinition>;

/** Normalizes a partial input into the canonical snapshot shape. */
export function defineAuthorization(
  input: AuthorizationDefinitionInput = {},
): AuthorizationDefinition {
  return {
    permissionSets: [...(input.permissionSets ?? [])],
    permissionSetGroups: [...(input.permissionSetGroups ?? [])],
    assignments: [...(input.assignments ?? [])],
    organizationWideDefaults: { ...(input.organizationWideDefaults ?? {}) },
    sharingRules: [...(input.sharingRules ?? [])],
    restrictionRules: [...(input.restrictionRules ?? [])],
  };
}
