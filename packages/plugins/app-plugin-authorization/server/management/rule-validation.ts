import type { AppAuthorizationService } from '../tokens.js';
import type { AccessConstraintValue } from '@nocobase/authorization/core';
export interface ScopeRuleInput {
  resource: { type: string; id: string };
  actions: readonly {
    action: string;
    scopeKey?: string;
    scope?: AccessConstraintValue;
    selection?: { type: string; policy?: AccessConstraintValue };
  }[];
}
export function validateDatabaseScopeRule(
  authz: AppAuthorizationService,
  rule: ScopeRuleInput,
): void {
  const business =
    rule.resource.type === 'resource'
      ? authz.resources
          .definitionsList()
          .find((item) => item.name === rule.resource.id)
      : undefined;
  if (rule.resource.type === 'resource' && !business)
    throw new TypeError('Unknown business resource');
  if (!business && rule.resource.type !== 'database.collection')
    throw new TypeError('Unsupported rule resource');
  const collection = authz.db.collections
    .list()
    .find((item) => item.name === rule.resource.id);
  if (!business && !collection)
    throw new TypeError('Unknown data rule collection');
  const actions = business
    ? business.actions.map((item) => item.name)
    : (collection?.actions ?? ['read', 'create', 'update', 'delete']).map(
        (action) => (typeof action === 'string' ? action : action.name),
      );
  if (
    new Set(
      rule.actions.map((item) => JSON.stringify([item.action, item.scopeKey])),
    ).size !== rule.actions.length
  )
    throw new TypeError('Duplicate rule action scopes');
  for (const entry of rule.actions) {
    if (
      (!business && entry.action === 'create') ||
      !actions.includes(entry.action)
    )
      throw new TypeError('Unsupported data rule action');
    if (business) {
      const target =
        entry.scopeKey &&
        business.actions.find((item) => item.name === entry.action)?.scopes?.[
          entry.scopeKey
        ];
      if (!target || !authz.db.collections.has(target.resource.id))
        throw new TypeError('Unknown business action scope');
    } else if (entry.scopeKey !== undefined)
      throw new TypeError('Underlying rules do not accept scopeKey');
    const scope = entry.scope ?? entry.selection?.policy;
    if (!scope || scope.type === 'all' || scope.type === 'ids') continue;
    if (scope.type !== 'database')
      throw new TypeError('Unsupported data scope');
    const recordAccess = scope.recordAccess;
    const key: unknown =
      typeof recordAccess === 'string'
        ? recordAccess
        : recordAccess && typeof recordAccess === 'object'
          ? Reflect.get(recordAccess, 'key')
          : undefined;
    const policy =
      typeof key === 'string' ? authz.recordAccess.get(key) : undefined;
    if (!policy) throw new TypeError('Unknown record access policy');
    const target =
      business && entry.scopeKey
        ? business.actions.find((item) => item.name === entry.action)?.scopes?.[
            entry.scopeKey
          ]
        : undefined;
    const collectionId = target?.resource.id ?? rule.resource.id;
    if (
      !policy.resources.some(
        (resource) =>
          resource.type === (target?.resource.type ?? rule.resource.type) &&
          (resource.id === '*' || resource.id === collectionId),
      ) ||
      (target?.options && !target.options.includes(policy.key))
    )
      throw new TypeError(
        'Record access policy is not applicable to this scope',
      );
  }
}
