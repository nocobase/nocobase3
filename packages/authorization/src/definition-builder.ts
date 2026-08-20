import { defineAuthorization } from './definition.js';
import type { AuthorizationDefinition, AuthorizationDefinitionInput } from './definition.js';
import type {
  ActionPermission,
  Assignment,
  ObjectPermission,
  OrganizationWideDefault,
  PermissionSet,
  PermissionSetGroup,
  RestrictionRule,
  SharingRule,
} from './types.js';

type PermissionSetInput = Omit<PermissionSet, 'key'>;
type PermissionSetGroupInput = Omit<PermissionSetGroup, 'key'>;
type AssignmentInput = Omit<Assignment, 'id'>;
type SharingRuleInput = Omit<SharingRule, 'key'>;
type RestrictionRuleInput = Omit<RestrictionRule, 'key'>;
type ObjectPermissionInput = Omit<ObjectPermission, 'resource'>;
type ActionPermissionInput = Omit<ActionPermission, 'action'>;

export class ObjectPermissionDefinitionBuilder {
  private readonly actions: ActionPermission[] = [];

  constructor(private readonly resource: string) {}

  action(action: string, input: ActionPermissionInput = {}): this {
    this.actions.push({ action, ...input });
    return this;
  }

  build(): ObjectPermission {
    return {
      resource: this.resource,
      actions: [...this.actions],
    };
  }
}

export class PermissionSetDefinitionBuilder {
  private value: Omit<PermissionSet, 'key' | 'permissions'> = {};
  private readonly permissions: ObjectPermission[] = [];

  constructor(private readonly key: string) {}

  id(id: string): this {
    this.value.id = id;
    return this;
  }

  title(title: string): this {
    this.value.title = title;
    return this;
  }

  resource(resource: string, input: ObjectPermissionInput): this;
  resource(resource: string, define: (permission: ObjectPermissionDefinitionBuilder) => void): this;
  resource(
    resource: string,
    input: ObjectPermissionInput | ((permission: ObjectPermissionDefinitionBuilder) => void),
  ): this {
    if (typeof input === 'function') {
      const builder = new ObjectPermissionDefinitionBuilder(resource);
      input(builder);
      this.permissions.push(builder.build());
    } else {
      this.permissions.push({ resource, ...input });
    }
    return this;
  }

  build(): PermissionSet {
    return { key: this.key, ...this.value, permissions: [...this.permissions] };
  }
}

export class PermissionSetGroupDefinitionBuilder {
  private value: Omit<PermissionSetGroup, 'key' | 'permissionSets'> = {};
  private readonly permissionSets: string[] = [];

  constructor(private readonly key: string) {}

  id(id: string): this {
    this.value.id = id;
    return this;
  }

  title(title: string): this {
    this.value.title = title;
    return this;
  }

  permissionSet(key: string): this {
    this.permissionSets.push(key);
    return this;
  }

  build(): PermissionSetGroup {
    return { key: this.key, ...this.value, permissionSets: [...this.permissionSets] };
  }
}

/** Fluent authoring facade that always builds the canonical object definition. */
export class AuthorizationDefinitionBuilder {
  private readonly permissionSets: PermissionSet[];
  private readonly permissionSetGroups: PermissionSetGroup[];
  private readonly assignments: Assignment[];
  private readonly organizationWideDefaults: Record<string, OrganizationWideDefault>;
  private readonly sharingRules: SharingRule[];
  private readonly restrictionRules: RestrictionRule[];

  constructor(input: AuthorizationDefinitionInput = {}) {
    this.permissionSets = [...(input.permissionSets ?? [])];
    this.permissionSetGroups = [...(input.permissionSetGroups ?? [])];
    this.assignments = [...(input.assignments ?? [])];
    this.organizationWideDefaults = { ...(input.organizationWideDefaults ?? {}) };
    this.sharingRules = [...(input.sharingRules ?? [])];
    this.restrictionRules = [...(input.restrictionRules ?? [])];
  }

  permissionSet(key: string, input: PermissionSetInput): this;
  permissionSet(key: string, define: (permissionSet: PermissionSetDefinitionBuilder) => void): this;
  permissionSet(
    key: string,
    input: PermissionSetInput | ((permissionSet: PermissionSetDefinitionBuilder) => void),
  ): this {
    if (typeof input === 'function') {
      const builder = new PermissionSetDefinitionBuilder(key);
      input(builder);
      this.permissionSets.push(builder.build());
    } else {
      this.permissionSets.push({ key, ...input });
    }
    return this;
  }

  permissionSetGroup(key: string, input: PermissionSetGroupInput): this;
  permissionSetGroup(key: string, define: (group: PermissionSetGroupDefinitionBuilder) => void): this;
  permissionSetGroup(
    key: string,
    input: PermissionSetGroupInput | ((group: PermissionSetGroupDefinitionBuilder) => void),
  ): this {
    if (typeof input === 'function') {
      const builder = new PermissionSetGroupDefinitionBuilder(key);
      input(builder);
      this.permissionSetGroups.push(builder.build());
    } else {
      this.permissionSetGroups.push({ key, ...input });
    }
    return this;
  }

  assignment(id: string, input: AssignmentInput): this {
    this.assignments.push({ id, ...input });
    return this;
  }

  organizationWideDefault(resource: string, value: OrganizationWideDefault): this {
    this.organizationWideDefaults[resource] = value;
    return this;
  }

  sharingRule(key: string, value: SharingRuleInput): this {
    this.sharingRules.push({ key, ...value });
    return this;
  }

  restrictionRule(key: string, value: RestrictionRuleInput): this {
    this.restrictionRules.push({ key, ...value });
    return this;
  }

  build(): AuthorizationDefinition {
    return defineAuthorization({
      permissionSets: this.permissionSets,
      permissionSetGroups: this.permissionSetGroups,
      assignments: this.assignments,
      organizationWideDefaults: this.organizationWideDefaults,
      sharingRules: this.sharingRules,
      restrictionRules: this.restrictionRules,
    });
  }
}

export type AuthorizationDefinitionCallback = (definition: AuthorizationDefinitionBuilder) => void;
