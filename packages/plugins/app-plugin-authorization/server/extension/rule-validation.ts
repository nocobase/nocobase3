import type { ResourceRef, RuleAction } from '@nocobase/authorization/core';
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
 * Checks a rule against the registered model: a business resource's actions
 * and data scopes, or a registered collection's actions, and record access
 * that applies to the targeted collection. Throws `TypeError`.
 */
export function validateDataScopeRule(
  authz: Pick<
    AuthorizationExtensionHost,
    'business' | 'database' | 'recordAccess'
  >,
  rule: DataScopeRuleInput,
): void {
  const business =
    rule.resource.type === 'business'
      ? authz.business.list().find((item) => item.name === rule.resource.id)
      : undefined;
  if (rule.resource.type === 'business' && !business)
    throw new TypeError('Unknown business resource');
  if (!business && rule.resource.type !== 'database.collection')
    throw new TypeError('Unsupported rule resource');
  const collection = authz.database.collections
    .list()
    .find((item) => item.name === rule.resource.id);
  if (!business && !collection)
    throw new TypeError('Unknown data rule collection');
  const actions = business
    ? business.actions.map((item) => item.name)
    : (collection?.actions ?? COLLECTION_ACTIONS);
  if (
    new Set(
      rule.actions.map((item) => JSON.stringify([item.action, item.scopeKey])),
    ).size !== rule.actions.length
  )
    throw new TypeError('Duplicate rule actions');
  for (const entry of rule.actions) {
    if (
      (!business && entry.action === 'create') ||
      !actions.includes(entry.action)
    )
      throw new TypeError('Unsupported data rule action');
    const scope = business
      ? business.actions
          .find((item) => item.name === entry.action)
          ?.dataScopes?.find((item) => item.key === entry.scopeKey)
      : undefined;
    if (business) {
      if (!scope || !authz.database.collections.has(scope.collection))
        throw new TypeError('Unknown business data scope');
    } else if (entry.scopeKey !== undefined)
      throw new TypeError('Collection rules do not accept scopeKey');
    if (entry.selection.type !== 'recordAccess') continue;
    const definition = authz.recordAccess.get(entry.selection.key);
    if (!definition) throw new TypeError('Unknown record access');
    const target = scope?.collection ?? rule.resource.id;
    if (
      !definition.collections.some((name) => name === '*' || name === target) ||
      (scope?.options && !scope.options.includes(definition.key))
    )
      throw new TypeError('Record access does not apply to this data scope');
  }
}
