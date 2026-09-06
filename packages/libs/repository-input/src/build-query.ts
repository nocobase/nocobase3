import { DefaultFilterBuilder } from './filter-builder.js';
import {
  DefaultSelectBuilder,
  type SelectBuilderState,
  type RelationSelectBranchInput,
} from './select-builder.js';
import { DefaultSortBuilder, sortExpressionToNode } from './sort-builder.js';
import {
  DefaultAggregateBuilder,
  aggregateExpressionToNode,
} from './aggregate-builder.js';
import { inputError, isRecord, snapshotJson } from './json.js';
import type {
  AggregateAst,
  AggregateOptions,
  FilterAst,
  FilterNode,
  RepositoryFilter,
  RepositoryRecord,
  RepositorySelect,
  RepositorySort,
  SelectAst,
  SelectNode,
  RelationSelectBranchNode,
  SortAst,
} from './types.js';

/** Materialize a filter callback, shorthand, or AST without a database schema. */
export function buildFilter<TRecord extends object = RepositoryRecord>(
  input: RepositoryFilter<TRecord>,
): FilterAst {
  let ast: FilterAst;
  if (typeof input === 'function') {
    const node = input(new DefaultFilterBuilder<TRecord>());
    if (
      !isRecord(node) ||
      !['condition', 'group', 'relation'].includes(node.kind)
    )
      inputError(['filter'], 'Callbacks must return a Filter node.');
    ast = {
      kind: 'filter',
      version: 1,
      root:
        node.kind === 'group'
          ? node
          : { kind: 'group', logic: 'and', items: [node] },
    };
  } else {
    if (!isRecord(input)) inputError(['filter'], 'Expected a filter object.');
    if (
      (input as Record<string, unknown>).kind === 'filter' &&
      (input as Record<string, unknown>).version === 1
    )
      ast = input as unknown as FilterAst;
    else
      ast = {
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: Object.entries(input).map(([field, value]): FilterNode => {
            if (
              value !== null &&
              !['string', 'number', 'boolean'].includes(typeof value)
            )
              inputError(
                ['filter', field],
                'Shorthand filters require scalar values.',
              );
            return {
              kind: 'condition',
              path: [field],
              operator: '$eq',
              value: value as string | number | boolean | null,
            };
          }),
        },
      };
  }
  return snapshotJson(ast);
}

export function buildSort<TRecord extends object = RepositoryRecord>(
  input: RepositorySort<TRecord>,
): SortAst {
  if (typeof input !== 'function') return snapshotJson(input);
  const result = input(new DefaultSortBuilder<TRecord>());
  const expressions = Array.isArray(result) ? result : [result];
  return snapshotJson({
    kind: 'sort',
    version: 1,
    items: expressions.map(sortExpressionToNode),
  } as const);
}

export function buildAggregate<TRecord extends object = RepositoryRecord>(
  input: AggregateOptions<TRecord>['aggregate'],
): AggregateAst {
  if (typeof input !== 'function') return snapshotJson(input);
  const selection = input(new DefaultAggregateBuilder<TRecord>());
  if (!isRecord(selection))
    inputError(
      ['aggregate'],
      'Callbacks must return an object of Aggregate Builder expressions.',
    );
  return snapshotJson({
    kind: 'aggregate',
    version: 1,
    items: Object.entries(selection).map(([alias, expression]) =>
      aggregateExpressionToNode(alias, expression),
    ),
  } as const);
}

/** Includes and combine branches may contain their own filter/sort callbacks. */
export function buildSelect<TRecord extends object = RepositoryRecord>(
  input: RepositorySelect<TRecord>,
): SelectAst {
  if (typeof input !== 'function') return snapshotJson(input);
  const builder = new DefaultSelectBuilder<TRecord>();
  if (input(builder) !== builder)
    inputError(['select'], 'Callbacks must return their Select Builder.');
  const ancestors = new Set<object>();
  const visit = <T>(state: object, build: () => T): T => {
    if (ancestors.has(state))
      inputError(['select'], 'Circular selection input.');
    ancestors.add(state);
    try {
      return build();
    } finally {
      ancestors.delete(state);
    }
  };
  const branch = (state: RelationSelectBranchInput): RelationSelectBranchNode =>
    visit(state, () => ({
      select: selection(state.select),
      filter:
        state.filter === undefined ? undefined : buildFilter(state.filter),
      sort: state.sort === undefined ? undefined : buildSort(state.sort),
      limit: state.limit,
      cursor: state.cursor,
      direction: state.direction,
      distinct: state.distinct,
      result:
        state.result?.kind === 'combine'
          ? {
              kind: 'combine',
              branches: Object.fromEntries(
                Object.entries(state.result.branches).map(([alias, value]) => [
                  alias,
                  branch(value),
                ]),
              ),
            }
          : state.result,
    }));
  const selection = (state: SelectBuilderState): SelectNode =>
    visit(state, () => ({
      kind: 'selection',
      fields: state.fields,
      includes: state.includes?.map((include) => ({
        ...branch(include),
        kind: 'include',
        relation: include.relation,
      })),
    }));
  return snapshotJson({
    kind: 'select',
    version: 1,
    root: selection(builder.toState()),
  } as const);
}
