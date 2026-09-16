import type { FilterGroupNode, FilterNode } from '@nocobase/db';

export function emptyFilter(): FilterGroupNode {
  return { kind: 'group', logic: 'and', items: [] };
}

export function policyFilter(
  value: string | { key: string; params?: unknown },
): FilterNode | undefined {
  if (
    typeof value === 'string' ||
    !value.params ||
    typeof value.params !== 'object'
  )
    return undefined;
  const filter: unknown = Reflect.get(value.params, 'filter');
  return isFilterNode(filter) ? filter : undefined;
}

function isFilterNode(value: unknown): value is FilterNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as Record<string, unknown>;
  if (node.kind === 'group')
    return (
      (node.logic === 'and' || node.logic === 'or') &&
      Array.isArray(node.items) &&
      node.items.every(isFilterNode)
    );
  if (node.kind === 'condition')
    return (
      Array.isArray(node.path) &&
      node.path.every((item) => typeof item === 'string') &&
      typeof node.operator === 'string'
    );
  return (
    node.kind === 'relation' &&
    Array.isArray(node.path) &&
    typeof node.quantifier === 'string'
  );
}

export function incompleteFilter(node: FilterNode | undefined): boolean {
  if (!node) return true;
  if (node.kind === 'group')
    return !node.items.length || node.items.some(incompleteFilter);
  return node.kind === 'condition'
    ? node.path.length === 0 || node.path.some((item) => !item)
    : false;
}

export function incompleteScope(
  scope: import('../authorization-client.js').AccessScope,
): boolean {
  if (scope.type !== 'database') return false;
  const value = scope.recordAccess;
  const key = typeof value === 'string' ? value : value.key;
  return key === 'customFilter' && incompleteFilter(policyFilter(value));
}
