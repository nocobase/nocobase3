import { condition, filter } from './filter.js';
import type {
  Assignment,
  AssignmentSubject,
  OrganizationWideDefault,
  PermissionSet,
  PermissionSetGroup,
  FilterAst,
  FilterMembershipNode,
  RestrictionRule,
  SharingRule,
} from './types.js';

export interface AuthorizationStore {
  findAssignments(
    subjects: readonly AssignmentSubject[],
    now: Date,
  ): Promise<Assignment[]>;
  getPermissionSet(key: string): Promise<PermissionSet | undefined>;
  getPermissionSetGroup(key: string): Promise<PermissionSetGroup | undefined>;
  getOrganizationWideDefault(
    resource: string,
  ): Promise<OrganizationWideDefault | undefined>;
  findSharingRules(
    subjects: readonly AssignmentSubject[],
    resource: string,
    action: string,
    now: Date,
  ): Promise<SharingRule[]>;
  createExplicitSharingFilter(
    rule: SharingRule,
    collection: string,
    identifier: string,
  ): Promise<FilterAst | undefined>;
  matchesFilterMembership(
    node: FilterMembershipNode,
    value: unknown,
  ): Promise<boolean>;
  findRestrictionRules(
    subjects: readonly AssignmentSubject[],
    resource: string,
    action: string,
  ): Promise<RestrictionRule[]>;
}

export interface MemoryAuthorizationStoreOptions {
  permissionSets?: readonly PermissionSet[];
  permissionSetGroups?: readonly PermissionSetGroup[];
  assignments?: readonly Assignment[];
  organizationWideDefaults?: Readonly<Record<string, OrganizationWideDefault>>;
  sharingRules?: readonly SharingRule[];
  restrictionRules?: readonly RestrictionRule[];
}

export class MemoryAuthorizationStore implements AuthorizationStore {
  private readonly permissionSets = new Map<string, PermissionSet>();
  private readonly permissionSetGroups = new Map<string, PermissionSetGroup>();
  private readonly assignments: Assignment[];
  private readonly defaults: Readonly<Record<string, OrganizationWideDefault>>;
  private readonly sharingRules: SharingRule[];
  private readonly restrictionRules: RestrictionRule[];

  constructor(options: MemoryAuthorizationStoreOptions = {}) {
    for (const item of options.permissionSets ?? []) {
      this.permissionSets.set(item.key, item);
    }
    for (const item of options.permissionSetGroups ?? []) {
      this.permissionSetGroups.set(item.key, item);
    }
    this.assignments = [...(options.assignments ?? [])];
    this.defaults = options.organizationWideDefaults ?? {};
    this.sharingRules = [...(options.sharingRules ?? [])];
    this.restrictionRules = [...(options.restrictionRules ?? [])];
  }

  async findAssignments(
    subjects: readonly AssignmentSubject[],
    now: Date,
  ): Promise<Assignment[]> {
    const keys = new Set(
      subjects.map((subject) => `${subject.type}:${subject.id}`),
    );
    return this.assignments.filter((assignment) => {
      if (!keys.has(`${assignment.subject.type}:${assignment.subject.id}`)) {
        return false;
      }
      if (assignment.startsAt && assignment.startsAt > now) {
        return false;
      }
      if (assignment.expiresAt && assignment.expiresAt <= now) {
        return false;
      }
      return true;
    });
  }

  async getPermissionSet(key: string): Promise<PermissionSet | undefined> {
    return this.permissionSets.get(key);
  }

  async getPermissionSetGroup(
    key: string,
  ): Promise<PermissionSetGroup | undefined> {
    return this.permissionSetGroups.get(key);
  }

  async getOrganizationWideDefault(
    resource: string,
  ): Promise<OrganizationWideDefault | undefined> {
    return this.defaults[resource];
  }

  async findSharingRules(
    subjects: readonly AssignmentSubject[],
    resource: string,
    action: string,
    now: Date,
  ): Promise<SharingRule[]> {
    const keys = new Set(
      subjects.map((subject) => `${subject.type}:${subject.id}`),
    );
    return this.sharingRules.filter(
      (rule) =>
        rule.resource === resource &&
        rule.actions.includes(action) &&
        rule.subjects.some((subject) =>
          keys.has(`${subject.type}:${subject.id}`),
        ) &&
        (!rule.startsAt || rule.startsAt <= now) &&
        (!rule.expiresAt || rule.expiresAt > now),
    );
  }

  async createExplicitSharingFilter(
    rule: SharingRule,
    collection: string,
    identifier: string,
  ): Promise<FilterAst | undefined> {
    if (rule.records.type !== 'records' || !rule.records.ids.length) {
      return undefined;
    }
    return filter(collection, condition(identifier, '$in', rule.records.ids));
  }

  async matchesFilterMembership(
    _node: FilterMembershipNode,
    _value: unknown,
  ): Promise<boolean> {
    throw new Error(
      'MemoryAuthorizationStore does not produce membership filters',
    );
  }

  async findRestrictionRules(
    subjects: readonly AssignmentSubject[],
    resource: string,
    action: string,
  ): Promise<RestrictionRule[]> {
    const keys = new Set(
      subjects.map((subject) => `${subject.type}:${subject.id}`),
    );
    return this.restrictionRules.filter(
      (rule) =>
        rule.resource === resource &&
        rule.actions.includes(action) &&
        rule.subjects.some((subject) =>
          keys.has(`${subject.type}:${subject.id}`),
        ),
    );
  }
}
