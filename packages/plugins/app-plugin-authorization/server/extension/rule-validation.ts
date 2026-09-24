import {
  COMPOSITE_RESOURCE_TYPE,
  dataScopeTarget,
  type ResourceRef,
  type RuleAction,
} from '@nocobase/authorization/core';
import type { AuthorizationExtensionHost } from '../host.js';

export interface DataScopeRuleInput {
  readonly resource: ResourceRef;
  readonly actions: readonly RuleAction[];
}

const COLLECTION_ACTIONS: readonly string[] = [
  'read',
  'create',
  'update',
  'delete',
];

/**
 * Checks a rule against the registered model: a composite's actions and data
 * scopes, or a registered collection's actions, and record access that
 * applies to the targeted collection. Throws `TypeError`.
 */
export function validateDataScopeRule(
  authz: Pick<
    AuthorizationExtensionHost,
    'composites' | 'database' | 'recordAccess'
  >,
  rule: DataScopeRuleInput,
): void {
  const composite =
    rule.resource.type === COMPOSITE_RESOURCE_TYPE
      ? authz.composites.list().find((item) => item.name === rule.resource.id)
      : undefined;
  if (rule.resource.type === COMPOSITE_RESOURCE_TYPE && !composite)
    throw new TypeError('Unknown composite');
  if (!composite && rule.resource.type !== 'database.collection')
    throw new TypeError('Unsupported rule resource');
  const collection = authz.database.collections
    .list()
    .find((item) => item.name === rule.resource.id);
  if (!composite && !collection)
    throw new TypeError('Unknown data rule collection');
  const actions = composite
    ? composite.actions.map((item) => item.name)
    : (collection?.actions ?? COLLECTION_ACTIONS);
  if (
    new Set(
      rule.actions.map((item) => JSON.stringify([item.action, item.scopeKey])),
    ).size !== rule.actions.length
  )
    throw new TypeError('Duplicate rule actions');
  for (const entry of rule.actions) {
    if (
      (!composite && entry.action === 'create') ||
      !actions.includes(entry.action)
    )
      throw new TypeError('Unsupported data rule action');
    const action = composite?.actions.find(
      (item) => item.name === entry.action,
    );
    const scope = action?.dataScopes?.find(
      (item) => item.key === entry.scopeKey,
    );
    const scopeTarget =
      action && scope ? dataScopeTarget(action, scope.key) : undefined;
    if (composite) {
      if (
        !scopeTarget ||
        scopeTarget.type !== 'database.collection' ||
        !authz.database.collections.has(scopeTarget.id)
      )
        throw new TypeError('Unknown composite data scope');
    } else if (entry.scopeKey !== undefined)
      throw new TypeError('Collection rules do not accept scopeKey');
    if (entry.selection.type !== 'recordAccess') continue;
    const definition = authz.recordAccess.get(entry.selection.key);
    if (!definition) throw new TypeError('Unknown record access');
    const target = scopeTarget?.id ?? rule.resource.id;
    if (
      !definition.collections.some((name) => name === '*' || name === target) ||
      (scope?.options && !scope.options.includes(definition.key))
    )
      throw new TypeError('Record access does not apply to this data scope');
  }
}
