import type {
  AuthorizationCatalog,
  AuthorizationDefinition,
  PolicyDescriptor,
} from './definition.js';
import type {
  ActionPermission,
  RecordScope,
  ResourceDefinition,
} from './types.js';

export type AuthorizationDiagnosticSeverity = 'error' | 'warning';

export type AuthorizationDiagnosticCode =
  | 'DUPLICATE_KEY'
  | 'UNKNOWN_RESOURCE'
  | 'UNKNOWN_ACTION'
  | 'UNKNOWN_FIELD'
  | 'UNKNOWN_POLICY'
  | 'INVALID_POLICY_SCOPE'
  | 'DUPLICATE_PERMISSION'
  | 'DUPLICATE_ACTION'
  | 'EMPTY_VALUE'
  | 'UNKNOWN_PERMISSION_SET'
  | 'UNKNOWN_PERMISSION_SET_GROUP';

export interface AuthorizationDiagnostic {
  severity: AuthorizationDiagnosticSeverity;
  code: AuthorizationDiagnosticCode;
  path: readonly (string | number)[];
  message: string;
}

export interface AuthorizationValidationResult {
  valid: boolean;
  diagnostics: readonly AuthorizationDiagnostic[];
}

function duplicateDiagnostics<T>(
  values: readonly T[],
  key: (value: T) => string,
  path: readonly (string | number)[],
  add: (diagnostic: AuthorizationDiagnostic) => void,
): void {
  const seen = new Map<string, number>();
  values.forEach((value, index) => {
    const valueKey = key(value);
    const first = seen.get(valueKey);
    if (first !== undefined) {
      add({
        severity: 'error',
        code: 'DUPLICATE_KEY',
        path: [...path, index],
        message: `Duplicate key "${valueKey}"; first declared at index ${first}`,
      });
    } else {
      seen.set(valueKey, index);
    }
  });
}

function policyMap(
  catalog: AuthorizationCatalog,
): Map<string, PolicyDescriptor> {
  return new Map(catalog.policies.map((policy) => [policy.key, policy]));
}

function validateScope(
  scope: RecordScope,
  path: readonly (string | number)[],
  usage: 'recordScope' | 'sharingRule' | 'restrictionRule',
  policies: Map<string, PolicyDescriptor>,
  add: (diagnostic: AuthorizationDiagnostic) => void,
): void {
  const policy = policies.get(scope.policy);
  if (!policy) {
    add({
      severity: 'error',
      code: 'UNKNOWN_POLICY',
      path: [...path, 'policy'],
      message: `Unknown policy "${scope.policy}"`,
    });
  } else if (!policy.appliesTo.includes(usage)) {
    add({
      severity: 'error',
      code: 'INVALID_POLICY_SCOPE',
      path: [...path, 'policy'],
      message: `Policy "${scope.policy}" cannot be used for ${usage}`,
    });
  }
}

function validateAction(
  action: ActionPermission,
  actionIndex: number,
  permissionPath: readonly (string | number)[],
  resource: ResourceDefinition,
  policies: Map<string, PolicyDescriptor>,
  add: (diagnostic: AuthorizationDiagnostic) => void,
): void {
  const actionPath = [...permissionPath, 'actions', actionIndex];
  if (!resource.actions.includes(action.action)) {
    add({
      severity: 'error',
      code: 'UNKNOWN_ACTION',
      path: [...actionPath, 'action'],
      message: `Unknown action "${action.action}" on resource "${resource.name}"`,
    });
  }
  const fields = new Set(Object.keys(resource.fields));
  const validateFields = (
    fieldType: 'inputFields' | 'outputFields',
    values: '*' | readonly string[] | undefined,
  ) => {
    if (values === '*' || values == null) {
      return;
    }
    for (const [fieldIndex, field] of values.entries()) {
      if (!fields.has(field)) {
        add({
          severity: 'error',
          code: 'UNKNOWN_FIELD',
          path: [...actionPath, fieldType, fieldIndex],
          message: `Unknown field "${field}" on resource "${resource.name}"`,
        });
      }
    }
  };
  validateFields('inputFields', action.inputFields);
  validateFields('outputFields', action.outputFields);
  for (const [scopeIndex, scope] of (action.recordScope ?? []).entries()) {
    validateScope(
      scope,
      [...actionPath, 'recordScope', scopeIndex],
      'recordScope',
      policies,
      add,
    );
  }
}

function validateRuleActions(
  actions: readonly string[],
  path: readonly (string | number)[],
  resource: ResourceDefinition,
  add: (diagnostic: AuthorizationDiagnostic) => void,
): void {
  if (!actions.length) {
    add({
      severity: 'error',
      code: 'EMPTY_VALUE',
      path,
      message: 'At least one action is required',
    });
  }
  actions.forEach((action, index) => {
    if (!resource.actions.includes(action)) {
      add({
        severity: 'error',
        code: 'UNKNOWN_ACTION',
        path: [...path, index],
        message: `Unknown action "${action}" on resource "${resource.name}"`,
      });
    }
  });
}

/** Validates the complete canonical definition and returns all diagnostics, rather than stopping at the first error. */
export function validateAuthorization(
  definition: AuthorizationDefinition,
  catalog: AuthorizationCatalog,
): AuthorizationValidationResult {
  const diagnostics: AuthorizationDiagnostic[] = [];
  const add = (diagnostic: AuthorizationDiagnostic) =>
    diagnostics.push(diagnostic);
  const resources = new Map(
    catalog.resources.map((resource) => [resource.name, resource]),
  );
  const policies = policyMap(catalog);
  const permissionSets = new Map<string, number>();
  const permissionSetGroups = new Map<string, number>();

  duplicateDiagnostics(
    definition.permissionSets,
    (item) => item.key,
    ['permissionSets'],
    add,
  );
  definition.permissionSets.forEach((set, setIndex) => {
    permissionSets.set(set.key, setIndex);
    const setPath = ['permissionSets', setIndex] as const;
    set.permissions.forEach((permission, permissionIndex) => {
      const permissionPath = [...setPath, 'permissions', permissionIndex];
      const resource = resources.get(permission.resource);
      if (!resource) {
        add({
          severity: 'error',
          code: 'UNKNOWN_RESOURCE',
          path: [...permissionPath, 'resource'],
          message: `Unknown resource "${permission.resource}"`,
        });
        return;
      }
      const sameResource = set.permissions.findIndex(
        (item) => item.resource === permission.resource,
      );
      if (sameResource !== permissionIndex) {
        add({
          severity: 'error',
          code: 'DUPLICATE_PERMISSION',
          path: [...permissionPath, 'resource'],
          message: `Permission set "${set.key}" declares resource "${permission.resource}" more than once`,
        });
      }
      const seenActions = new Set<string>();
      permission.actions.forEach((action, actionIndex) => {
        if (seenActions.has(action.action)) {
          add({
            severity: 'error',
            code: 'DUPLICATE_ACTION',
            path: [...permissionPath, 'actions', actionIndex],
            message: `Permission set "${set.key}" declares action "${action.action}" more than once`,
          });
        }
        seenActions.add(action.action);
        validateAction(
          action,
          actionIndex,
          permissionPath,
          resource,
          policies,
          add,
        );
      });
    });
  });

  duplicateDiagnostics(
    definition.permissionSetGroups,
    (item) => item.key,
    ['permissionSetGroups'],
    add,
  );
  definition.permissionSetGroups.forEach((group, groupIndex) => {
    permissionSetGroups.set(group.key, groupIndex);
    group.permissionSets.forEach((key, itemIndex) => {
      if (!permissionSets.has(key)) {
        add({
          severity: 'error',
          code: 'UNKNOWN_PERMISSION_SET',
          path: [
            'permissionSetGroups',
            groupIndex,
            'permissionSets',
            itemIndex,
          ],
          message: `Unknown Permission Set "${key}"`,
        });
      }
    });
  });
  const assignmentIds = new Set<string>();
  definition.assignments.forEach((assignment, assignmentIndex) => {
    if (assignmentIds.has(assignment.id)) {
      add({
        severity: 'error',
        code: 'DUPLICATE_KEY',
        path: ['assignments', assignmentIndex, 'id'],
        message: `Duplicate assignment id "${assignment.id}"`,
      });
    }
    assignmentIds.add(assignment.id);
    const targetPath = ['assignments', assignmentIndex, 'target', 'key'];
    const targetMap =
      assignment.target.type === 'permissionSet'
        ? permissionSets
        : permissionSetGroups;
    const targetCode =
      assignment.target.type === 'permissionSet'
        ? 'UNKNOWN_PERMISSION_SET'
        : 'UNKNOWN_PERMISSION_SET_GROUP';
    if (!targetMap.has(assignment.target.key)) {
      add({
        severity: 'error',
        code: targetCode,
        path: targetPath,
        message: `Unknown ${assignment.target.type} "${assignment.target.key}"`,
      });
    }
  });
  for (const resource of Object.keys(definition.organizationWideDefaults)) {
    const resourceDefinition = resources.get(resource);
    if (!resourceDefinition) {
      add({
        severity: 'error',
        code: 'UNKNOWN_RESOURCE',
        path: ['organizationWideDefaults', resource],
        message: `Unknown resource "${resource}"`,
      });
    }
  }

  duplicateDiagnostics(
    definition.sharingRules,
    (item) => item.key,
    ['sharingRules'],
    add,
  );
  definition.sharingRules.forEach((rule, ruleIndex) => {
    const rulePath = ['sharingRules', ruleIndex] as const;
    const resourceDefinition = resources.get(rule.resource);
    if (!resourceDefinition) {
      add({
        severity: 'error',
        code: 'UNKNOWN_RESOURCE',
        path: [...rulePath, 'resource'],
        message: `Unknown resource "${rule.resource}"`,
      });
    } else {
      validateRuleActions(
        rule.actions,
        [...rulePath, 'actions'],
        resourceDefinition,
        add,
      );
    }
    if (!rule.subjects.length) {
      add({
        severity: 'error',
        code: 'EMPTY_VALUE',
        path: [...rulePath, 'subjects'],
        message: 'At least one sharing recipient is required',
      });
    }
    if (rule.records.type === 'criteria') {
      if (!rule.records.scopes.length) {
        add({
          severity: 'error',
          code: 'EMPTY_VALUE',
          path: [...rulePath, 'records', 'scopes'],
          message: 'At least one sharing record scope is required',
        });
      }
      rule.records.scopes.forEach((scope, scopeIndex) => {
        validateScope(
          scope,
          [...rulePath, 'records', 'scopes', scopeIndex],
          'sharingRule',
          policies,
          add,
        );
      });
    } else if (!rule.records.ids.length) {
      add({
        severity: 'error',
        code: 'EMPTY_VALUE',
        path: [...rulePath, 'records', 'ids'],
        message: 'At least one shared record id is required',
      });
    }
  });

  duplicateDiagnostics(
    definition.restrictionRules,
    (item) => item.key,
    ['restrictionRules'],
    add,
  );
  definition.restrictionRules.forEach((rule, ruleIndex) => {
    const rulePath = ['restrictionRules', ruleIndex] as const;
    const resourceDefinition = resources.get(rule.resource);
    if (!resourceDefinition) {
      add({
        severity: 'error',
        code: 'UNKNOWN_RESOURCE',
        path: [...rulePath, 'resource'],
        message: `Unknown resource "${rule.resource}"`,
      });
    } else {
      validateRuleActions(
        rule.actions,
        [...rulePath, 'actions'],
        resourceDefinition,
        add,
      );
    }
    if (!rule.subjects.length) {
      add({
        severity: 'error',
        code: 'EMPTY_VALUE',
        path: [...rulePath, 'subjects'],
        message: 'At least one restricted subject is required',
      });
    }
    if (!rule.scopes.length) {
      add({
        severity: 'error',
        code: 'EMPTY_VALUE',
        path: [...rulePath, 'scopes'],
        message: 'At least one restriction scope is required',
      });
    }
    rule.scopes.forEach((scope, scopeIndex) => {
      validateScope(
        scope,
        [...rulePath, 'scopes', scopeIndex],
        'restrictionRule',
        policies,
        add,
      );
    });
  });
  return {
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics,
  };
}
