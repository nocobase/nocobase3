import {
  allRecords,
  andFilters,
  assertFilterCollection,
  matchesFilterAsync,
  orFilters,
} from "./filter.js";
import { AuthorizationDefinitionBuilder } from "./definition-builder.js";
import { defineAuthorization } from "./definition.js";
import { validateAuthorization } from "./diagnostics.js";
import { diffAuthorization } from "./operations.js";
import { PolicyRegistry, ResourceRegistry } from "./registry.js";
import { standardPolicies } from "./standard-policies.js";
import type { AuthorizationStore } from "./store.js";
import type { AuthorizationDefinitionCallback } from "./definition-builder.js";
import type {
  AuthorizationCatalog,
  AuthorizationDefinition,
  AuthorizationDefinitionInput,
  PolicyDescriptor,
} from "./definition.js";
import type { AuthorizationValidationResult } from "./diagnostics.js";
import type { AuthorizationOperation } from "./operations.js";
import type {
  ActionPermission,
  AssignmentSubject,
  AuthorizationFieldRequest,
  AuthorizationPlan,
  AuthorizationReason,
  AuthorizationRequest,
  FilterAst,
  PermissionSet,
  PolicyDefinition,
  Principal,
  RecordScope,
  RelationAuthorizationPlan,
  RelationAuthorizationRequest,
  ResourceDefinition,
} from "./types.js";

export interface AuthorizationOptions {
  store: AuthorizationStore;
  defaultAccess?: "deny";
  policies?: readonly PolicyDefinition[];
}

export interface AuthorizationActionPlansRequest {
  resource: string;
  actions: readonly string[];
  fields?: Readonly<Record<string, AuthorizationFieldRequest>>;
  now?: Date;
}

export type AuthorizationActionPlans = Readonly<
  Record<string, AuthorizationPlan>
>;

function unionFields(
  values: readonly ("*" | readonly string[] | undefined)[],
): "*" | string[] {
  if (values.includes("*")) {
    return "*";
  }
  return [...new Set(values.flatMap((value) => value ?? []))];
}

function fieldsAllowed(
  requested: readonly string[] | undefined,
  allowed: "*" | readonly string[],
): boolean {
  return (
    !requested ||
    allowed === "*" ||
    requested.every((field) => allowed.includes(field))
  );
}

export class Authorization {
  readonly resources: ResourceRegistry = new ResourceRegistry();
  readonly policies: PolicyRegistry = new PolicyRegistry();
  private readonly store: AuthorizationStore;

  constructor(options: AuthorizationOptions) {
    this.store = options.store;
    for (const policy of standardPolicies()) {
      this.policies.register(policy);
    }
    for (const policy of options.policies ?? []) {
      this.policies.register(policy);
    }
  }

  define(input?: AuthorizationDefinitionInput): AuthorizationDefinition;
  define(callback: AuthorizationDefinitionCallback): AuthorizationDefinition;
  define(
    input: AuthorizationDefinitionInput | AuthorizationDefinitionCallback = {},
  ): AuthorizationDefinition {
    if (typeof input === "function") {
      const builder = new AuthorizationDefinitionBuilder();
      input(builder);
      return builder.build();
    }
    return defineAuthorization(input);
  }

  describe(): AuthorizationCatalog {
    return {
      resources: this.resources.list(),
      policies: this.policies.list().map((policy): PolicyDescriptor => ({
        key: policy.key,
        ...(policy.title === undefined ? {} : { title: policy.title }),
        ...(policy.description === undefined
          ? {}
          : { description: policy.description }),
        ...(policy.paramsSchema === undefined
          ? {}
          : { paramsSchema: policy.paramsSchema }),
        appliesTo: [...policy.appliesTo],
      })),
    };
  }

  validate(definition: AuthorizationDefinition): AuthorizationValidationResult {
    return validateAuthorization(definition, this.describe());
  }

  diff(
    current: AuthorizationDefinition,
    desired: AuthorizationDefinition,
  ): AuthorizationOperation[] {
    return diffAuthorization(current, desired);
  }

  async plan(
    principal: Principal,
    request: AuthorizationRequest,
  ): Promise<AuthorizationPlan> {
    return this.planInternal(principal, request);
  }

  /** Builds several Action plans while resolving the subject's assignments once. */
  async planActions(
    principal: Principal,
    request: AuthorizationActionPlansRequest,
  ): Promise<AuthorizationActionPlans> {
    const now = request.now ?? new Date();
    const subjects = this.resolveSubjects(principal);
    const sets = await this.resolvePermissionSets(subjects, now);
    const uniqueActions = [...new Set(request.actions)];
    const plans = await Promise.all(
      uniqueActions.map(
        async (action) =>
          [
            action,
            await this.planInternal(
              principal,
              {
                resource: request.resource,
                action,
                fields: request.fields?.[action],
                now,
              },
              { now, subjects, sets },
            ),
          ] as const,
      ),
    );
    return Object.fromEntries(plans);
  }

  private async planInternal(
    principal: Principal,
    request: AuthorizationRequest,
    context?: {
      now: Date;
      subjects: readonly AssignmentSubject[];
      sets: readonly PermissionSet[];
    },
  ): Promise<AuthorizationPlan> {
    const reasons: AuthorizationReason[] = [];
    const resource = this.resources.get(request.resource);
    if (!resource || !resource.actions.includes(request.action)) {
      return this.denied(
        reasons,
        "UNKNOWN_RESOURCE_OR_ACTION",
        `Unknown resource or action: ${request.resource}.${request.action}`,
      );
    }

    try {
      const now = context?.now ?? request.now ?? new Date();
      const subjects = context?.subjects ?? this.resolveSubjects(principal);
      const sets =
        context?.sets ?? (await this.resolvePermissionSets(subjects, now));
      const grants = sets.flatMap((set) =>
        set.permissions
          .filter((permission) => permission.resource === resource.name)
          .flatMap((permission) =>
            permission.actions
              .filter((action) => action.action === request.action)
              .map((action) => ({ set, action })),
          ),
      );
      if (!grants.length) {
        return this.denied(
          reasons,
          "NO_OBJECT_PERMISSION",
          `No Object Permission allows ${resource.name}.${request.action}`,
        );
      }

      this.validateActionPermissions(
        resource,
        grants.map(({ action }) => action),
      );
      for (const { set } of grants) {
        reasons.push({
          type: "permissionSet",
          key: set.key,
          message: `${set.key} allows ${resource.name}.${request.action}`,
        });
      }

      const input = unionFields(grants.map(({ action }) => action.inputFields));
      const output = unionFields(
        grants.map(({ action }) => action.outputFields),
      );
      if (!this.requestedFieldsAllowed(request.fields, input, output)) {
        return this.denied(
          reasons,
          "FIELD_NOT_ALLOWED",
          "One or more input, output, filter, sort, or group fields are not allowed",
        );
      }
      reasons.push({
        type: "fieldSecurity",
        key: request.action,
        message: `Field permissions resolved for ${request.action}`,
      });

      if (request.action === "create") {
        return { allowed: true, fields: { input, output }, reasons };
      }

      const recordFilters = await this.compileScopes(
        principal,
        resource,
        request.action,
        grants.flatMap(({ action }) => action.recordScope ?? []),
        "recordScope",
        reasons,
      );
      await this.addBaselineFilters(
        principal,
        resource,
        request.action,
        grants.flatMap(({ action }) => action.recordScope ?? []),
        recordFilters,
        reasons,
      );
      await this.addSharingFilters(
        principal,
        subjects,
        resource,
        request.action,
        now,
        recordFilters,
        reasons,
      );
      if (!recordFilters.length) {
        return this.denied(
          reasons,
          "NO_RECORD_ACCESS",
          `No Record Access allows ${resource.name}.${request.action}`,
        );
      }

      const restrictionFilters = await this.compileRestrictionFilters(
        principal,
        subjects,
        resource,
        request.action,
        reasons,
      );
      // Positive grants are additive. Restrictions are the only mandatory
      // intersection, so keep the simple OR shape when no restriction applies.
      const positiveFilter = orFilters(resource.name, recordFilters);
      const effectiveFilter = restrictionFilters.length
        ? andFilters(resource.name, [positiveFilter, ...restrictionFilters])
        : positiveFilter;
      const allowed = request.record
        ? await matchesFilterAsync(
            effectiveFilter,
            request.record,
            (node, value) => this.store.matchesFilterMembership(node, value),
          )
        : true;
      if (!allowed) {
        reasons.push({
          type: "recordAccess",
          key: "recordMismatch",
          message:
            "The record does not match the effective Record Access filter",
        });
      }
      return {
        allowed,
        filter: effectiveFilter,
        fields: { input, output },
        reasons,
      };
    } catch (error) {
      return this.denied(
        reasons,
        "AUTHORIZATION_RESOLUTION_FAILED",
        this.errorMessage(error),
      );
    }
  }

  async planRelation(
    principal: Principal,
    request: RelationAuthorizationRequest,
  ): Promise<RelationAuthorizationPlan> {
    const reasons: AuthorizationReason[] = [];
    try {
      const source = this.resources.get(request.resource);
      if (!source) {
        return this.deniedRelation(
          reasons,
          "UNKNOWN_RESOURCE",
          `Unknown resource: ${request.resource}`,
        );
      }
      const field = source.fields[request.field];
      if (!field || field.type !== "relation") {
        return this.deniedRelation(
          reasons,
          "UNKNOWN_RELATION",
          `Unknown relation: ${request.resource}.${request.field}`,
        );
      }
      const target = this.resources.get(field.target);
      if (!target) {
        return this.deniedRelation(
          reasons,
          "UNKNOWN_TARGET_RESOURCE",
          `Unknown relation target: ${field.target}`,
        );
      }

      const sourceAction = request.action === "traverse" ? "read" : "update";
      const sourceFields: AuthorizationFieldRequest =
        request.action === "traverse"
          ? { output: [request.field] }
          : { input: [request.field] };
      const sourcePlan = await this.plan(principal, {
        resource: source.name,
        action: sourceAction,
        fields: sourceFields,
        record: request.sourceRecord,
        now: request.now,
      });
      reasons.push(...sourcePlan.reasons);
      if (!sourcePlan.allowed) {
        return { allowed: false, sourceFilter: sourcePlan.filter, reasons };
      }

      // Relation operations derive their source permission from the ordinary
      // Action and relation field security: read for traversal, update for
      // connecting or disconnecting.
      if (request.action === "disconnect") {
        return { allowed: true, sourceFilter: sourcePlan.filter, reasons };
      }

      const targetAction = "read";
      const targetPlan = await this.plan(principal, {
        resource: target.name,
        action: targetAction,
        fields: request.targetFields,
        record: request.targetRecord,
        now: request.now,
      });
      reasons.push(...targetPlan.reasons);
      if (!targetPlan.allowed) {
        return {
          allowed: false,
          sourceFilter: sourcePlan.filter,
          targetFilter: targetPlan.filter,
          reasons,
        };
      }

      const targetFilters: FilterAst[] = targetPlan.filter
        ? [targetPlan.filter]
        : [allRecords(target.name)];
      const targetFilter = andFilters(target.name, targetFilters);
      if (
        request.targetRecord &&
        !(await matchesFilterAsync(
          targetFilter,
          request.targetRecord,
          (node, value) => this.store.matchesFilterMembership(node, value),
        ))
      ) {
        reasons.push({
          type: "recordAccess",
          key: "relationTargetMismatch",
          message:
            "The target record does not match the effective relation target filter",
        });
        return {
          allowed: false,
          sourceFilter: sourcePlan.filter,
          targetFilter,
          reasons,
        };
      }
      return {
        allowed: true,
        sourceFilter: sourcePlan.filter,
        targetFilter,
        reasons,
      };
    } catch (error) {
      return this.deniedRelation(
        reasons,
        "RELATION_AUTHORIZATION_FAILED",
        this.errorMessage(error),
      );
    }
  }

  async can(
    principal: Principal,
    request: AuthorizationRequest,
  ): Promise<boolean> {
    return (await this.plan(principal, request)).allowed;
  }

  async canRelation(
    principal: Principal,
    request: RelationAuthorizationRequest,
  ): Promise<boolean> {
    return (await this.planRelation(principal, request)).allowed;
  }

  explain(
    principal: Principal,
    request: AuthorizationRequest,
  ): Promise<AuthorizationPlan> {
    return this.plan(principal, request);
  }

  private resolveSubjects(principal: Principal): AssignmentSubject[] {
    return [
      { type: "user", id: principal.id },
      { type: "allAuthenticatedUsers", id: "*" },
    ];
  }

  private async resolvePermissionSets(
    subjects: readonly AssignmentSubject[],
    now: Date,
  ): Promise<PermissionSet[]> {
    const assignments = await this.store.findAssignments(subjects, now);
    const keys = new Set<string>();
    for (const assignment of assignments) {
      if (assignment.target.type === "permissionSet") {
        keys.add(assignment.target.key);
      } else {
        const group = await this.store.getPermissionSetGroup(
          assignment.target.key,
        );
        if (!group) {
          throw new Error(
            `Unknown Permission Set Group: ${assignment.target.key}`,
          );
        }
        for (const key of group.permissionSets) {
          keys.add(key);
        }
      }
    }
    const requestedKeys = [...keys];
    const sets = await Promise.all(
      requestedKeys.map((key) => this.store.getPermissionSet(key)),
    );
    const missing = sets.findIndex((set) => !set);
    if (missing >= 0) {
      throw new Error(`Unknown Permission Set: ${requestedKeys[missing]}`);
    }
    return sets as PermissionSet[];
  }

  private async compileScopes(
    principal: Principal,
    resource: ResourceDefinition,
    action: string,
    scopes: readonly RecordScope[],
    usage: "recordScope" | "sharingRule" | "restrictionRule",
    reasons: AuthorizationReason[],
  ): Promise<FilterAst[]> {
    const filters: FilterAst[] = [];
    for (const scope of scopes) {
      const policy = this.policies.get(scope.policy);
      if (!policy || !policy.appliesTo.includes(usage)) {
        throw new Error(`Unknown ${usage} Policy: ${scope.policy}`);
      }
      const compiled = await policy.compile({
        principal,
        resource,
        action,
        params: scope.params,
      });
      assertFilterCollection(compiled, resource.name);
      filters.push(compiled);
      reasons.push({
        type: "recordAccess",
        key: scope.policy,
        message: `${scope.policy} contributes a record scope`,
      });
    }
    return filters;
  }

  private async addSharingFilters(
    principal: Principal,
    subjects: readonly AssignmentSubject[],
    resource: ResourceDefinition,
    action: string,
    now: Date,
    filters: FilterAst[],
    reasons: AuthorizationReason[],
  ): Promise<void> {
    const rules = await this.store.findSharingRules(
      subjects,
      resource.name,
      action,
      now,
    );
    for (const rule of rules) {
      if (rule.records.type === "criteria") {
        const compiled = await this.compileScopes(
          principal,
          resource,
          action,
          rule.records.scopes,
          "sharingRule",
          reasons,
        );
        if (!compiled.length) {
          throw new Error(`Sharing Rule "${rule.key}" has no record scope`);
        }
        filters.push(orFilters(resource.name, compiled));
      } else {
        const identifier = resource.attributes?.identifier ?? "id";
        if (resource.fields[identifier]?.type !== "scalar") {
          throw new Error(
            `Resource "${resource.name}" does not declare a scalar identifier field`,
          );
        }
        const explicitFilter = await this.store.createExplicitSharingFilter(
          rule,
          resource.name,
          identifier,
        );
        if (explicitFilter) {
          filters.push(explicitFilter);
        }
      }
      reasons.push({
        type: "sharingRule",
        key: rule.key,
        message: `${rule.key} shares a record range`,
      });
    }
  }

  private async compileRestrictionFilters(
    principal: Principal,
    subjects: readonly AssignmentSubject[],
    resource: ResourceDefinition,
    action: string,
    reasons: AuthorizationReason[],
  ): Promise<FilterAst[]> {
    const rules = await this.store.findRestrictionRules(
      subjects,
      resource.name,
      action,
    );
    const filters: FilterAst[] = [];
    for (const rule of rules) {
      const compiled = await this.compileScopes(
        principal,
        resource,
        action,
        rule.scopes,
        "restrictionRule",
        reasons,
      );
      if (!compiled.length) {
        throw new Error(`Restriction Rule "${rule.key}" has no record scope`);
      }
      filters.push(orFilters(resource.name, compiled));
      reasons.push({
        type: "restrictionRule",
        key: rule.key,
        message: `${rule.key} restricts the final record range`,
      });
    }
    return filters;
  }

  private async addBaselineFilters(
    principal: Principal,
    resource: ResourceDefinition,
    action: string,
    explicitScopes: readonly RecordScope[],
    filters: FilterAst[],
    reasons: AuthorizationReason[],
  ): Promise<void> {
    const baseline = await this.store.getOrganizationWideDefault(resource.name);
    const access = baseline?.access ?? "private";
    if (
      (access === "publicReadWrite" && ["read", "update"].includes(action)) ||
      (access === "publicReadOnly" && action === "read")
    ) {
      filters.push(allRecords(resource.name));
      reasons.push({
        type: "organizationWideDefault",
        key: access,
        message: `${resource.name} is ${access}`,
      });
    }
    const ownerField = resource.attributes?.owner;
    const ownerAlreadyGranted = explicitScopes.some(
      (scope) =>
        scope.policy === "recordsIOwn" || scope.policy === "allRecords",
    );
    if (
      ownerField &&
      !ownerAlreadyGranted &&
      ["read", "update", "delete"].includes(action)
    ) {
      const policy = this.policies.get("recordsIOwn");
      if (!policy) {
        throw new Error("recordsIOwn policy is not registered");
      }
      filters.push(
        await policy.compile({
          principal,
          resource,
          action,
          params: undefined,
        }),
      );
      reasons.push({
        type: "ownerAccess",
        key: "recordOwner",
        message: "Record ownership grants access",
      });
    }
  }

  private requestedFieldsAllowed(
    requested: AuthorizationFieldRequest | undefined,
    input: "*" | readonly string[],
    output: "*" | readonly string[],
  ): boolean {
    if (!requested) {
      return true;
    }
    return (
      fieldsAllowed(requested.input, input) &&
      fieldsAllowed(requested.output, output) &&
      fieldsAllowed(requested.filter, output) &&
      fieldsAllowed(requested.sort, output) &&
      fieldsAllowed(requested.group, output)
    );
  }

  private validateActionPermissions(
    resource: ResourceDefinition,
    actions: readonly ActionPermission[],
  ): void {
    const fields = new Set(Object.keys(resource.fields));
    for (const action of actions) {
      for (const field of [
        ...(action.inputFields === "*" ? [] : (action.inputFields ?? [])),
        ...(action.outputFields === "*" ? [] : (action.outputFields ?? [])),
      ]) {
        if (!fields.has(field)) {
          throw new Error(
            `Unknown field "${field}" in ${resource.name}.${action.action}`,
          );
        }
      }
    }
  }

  private denied(
    reasons: AuthorizationReason[],
    key: string,
    message: string,
  ): AuthorizationPlan {
    return {
      allowed: false,
      reasons: [...reasons, { type: "error", key, message }],
    };
  }

  private deniedRelation(
    reasons: AuthorizationReason[],
    key: string,
    message: string,
  ): RelationAuthorizationPlan {
    return {
      allowed: false,
      reasons: [...reasons, { type: "error", key, message }],
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : "Authorization resolution failed";
  }
}
