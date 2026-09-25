import type { FilterGroupNode, FilterNode } from '@nocobase/repository-input';

export function emptyFilter(): FilterGroupNode {
  return { kind: 'group', logic: 'and', items: [] };
}

/** The filter of a `customFilter` selection or scope value. */
export function policyFilter(value: unknown): FilterNode | undefined {
  const params: unknown =
    value && typeof value === 'object'
      ? Reflect.get(value, 'params')
      : undefined;
  if (!params || typeof params !== 'object') return undefined;
  const filter: unknown = Reflect.get(params, 'filter');
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

/** A `customFilter` selection whose filter is still being written. */
export function incompleteSelection(
  selection: import('../authorization-client.js').RecordSelection,
): boolean {
  return (
    selection.type === 'recordAccess' &&
    selection.key === 'customFilter' &&
    incompleteFilter(policyFilter(selection))
  );
}
