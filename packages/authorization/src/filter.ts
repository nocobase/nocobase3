import type {
  FilterAst,
  FilterConditionNode,
  FilterGroupNode,
  FilterMembershipNode,
  FilterNode,
  FilterOperator,
  FilterValue,
} from "./types.js";

const operators = new Set<FilterOperator>([
  "$includes",
  "$notIncludes",
  "$eq",
  "$ne",
  "$neq",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$empty",
  "$notEmpty",
  "$dateOn",
  "$dateNotOn",
  "$dateBefore",
  "$dateAfter",
  "$dateNotBefore",
  "$dateNotAfter",
  "$dateBetween",
  "$in",
  "$notIn",
  "$match",
  "$notMatch",
  "$anyOf",
  "$noneOf",
  "$isTruly",
  "$isFalsy",
  "$exists",
  "$notExists",
  "$childIn",
  "$childNotIn",
]);

export function condition(
  path: string | readonly string[],
  operator: FilterOperator,
  value?: FilterValue,
): FilterConditionNode {
  return {
    kind: "condition",
    path: typeof path === "string" ? path.split(".") : path,
    operator,
    ...(value === undefined ? {} : { value }),
  };
}

export function membership(
  path: string | readonly string[],
  source: FilterMembershipNode["source"],
): FilterMembershipNode {
  return {
    kind: "membership",
    path: typeof path === "string" ? path.split(".") : path,
    source,
  };
}

export function group(
  logic: "and" | "or",
  items: readonly FilterNode[],
): FilterGroupNode {
  return { kind: "group", logic, items: [...items] };
}

export function filter(
  collection: string,
  root: FilterNode | readonly FilterNode[],
): FilterAst {
  const items = isFilterNodeArray(root) ? [...root] : [root];
  return { kind: "filter", version: 1, collection, root: group("and", items) };
}

function isFilterNodeArray(
  value: FilterNode | readonly FilterNode[],
): value is readonly FilterNode[] {
  return Array.isArray(value);
}

export function allRecords(collection: string): FilterAst {
  return { kind: "filter", version: 1, collection, root: group("and", []) };
}

export function orFilters(
  collection: string,
  filters: readonly FilterAst[],
): FilterAst {
  if (filters.some((item) => item.root.items.length === 0)) {
    return allRecords(collection);
  }
  return {
    kind: "filter",
    version: 1,
    collection,
    root: group(
      "or",
      filters.map((item) =>
        item.root.items.length === 1 ? item.root.items[0] : item.root,
      ),
    ),
  };
}

export function andFilters(
  collection: string,
  filters: readonly FilterAst[],
): FilterAst {
  const effective = filters.filter((item) => item.root.items.length > 0);
  if (!effective.length) {
    return allRecords(collection);
  }
  return {
    kind: "filter",
    version: 1,
    collection,
    root: group(
      "and",
      effective.map((item) =>
        item.root.items.length === 1 ? item.root.items[0] : item.root,
      ),
    ),
  };
}

function assertPath(path: unknown): asserts path is readonly string[] {
  if (
    !Array.isArray(path) ||
    !path.length ||
    path.some((part) => typeof part !== "string" || !part)
  ) {
    throw new Error("Invalid Filter AST path");
  }
}

function assertNode(node: unknown): asserts node is FilterNode {
  if (!node || typeof node !== "object") {
    throw new Error("Invalid Filter AST node");
  }
  const candidate = node as Record<string, unknown>;
  if (candidate.kind === "condition") {
    assertPath(candidate.path);
    if (!operators.has(candidate.operator as FilterOperator)) {
      throw new Error("Invalid Filter AST operator");
    }
    return;
  }
  if (candidate.kind === "group") {
    if (candidate.logic !== "and" && candidate.logic !== "or") {
      throw new Error("Invalid Filter AST group logic");
    }
    if (!Array.isArray(candidate.items)) {
      throw new Error("Invalid Filter AST group items");
    }
    for (const item of candidate.items) {
      assertNode(item);
    }
    return;
  }
  if (candidate.kind === "relation") {
    assertPath(candidate.path);
    if (
      !["exists", "notExists", "some", "none", "empty", "notEmpty"].includes(
        candidate.quantifier as string,
      )
    ) {
      throw new Error("Invalid Filter AST relation quantifier");
    }
    if (candidate.filter !== undefined) {
      assertNode(candidate.filter);
    }
    return;
  }
  if (candidate.kind === "membership") {
    assertPath(candidate.path);
    const source = candidate.source as Record<string, unknown> | undefined;
    if (
      !source ||
      typeof source.collection !== "string" ||
      !source.collection ||
      typeof source.field !== "string" ||
      !source.field ||
      !source.where ||
      typeof source.where !== "object" ||
      Array.isArray(source.where) ||
      !Object.keys(source.where).length
    ) {
      throw new Error("Invalid Filter AST membership source");
    }
    for (const [key, value] of Object.entries(
      source.where as Record<string, unknown>,
    )) {
      if (
        !key ||
        (value !== null &&
          !["string", "number", "boolean"].includes(typeof value))
      ) {
        throw new Error("Invalid Filter AST membership condition");
      }
    }
    return;
  }
  throw new Error("Invalid Filter AST node kind");
}

export function assertValidFilter(ast: unknown): asserts ast is FilterAst {
  if (!ast || typeof ast !== "object") {
    throw new Error("Invalid Filter AST");
  }
  const candidate = ast as Record<string, unknown>;
  if (candidate.kind !== "filter" || candidate.version !== 1) {
    throw new Error("Invalid Filter AST envelope");
  }
  if (
    candidate.collection !== undefined &&
    typeof candidate.collection !== "string"
  ) {
    throw new Error("Invalid Filter AST collection");
  }
  assertNode(candidate.root);
}

export function assertFilterCollection(
  ast: FilterAst,
  collection: string,
): void {
  assertValidFilter(ast);
  if (ast.collection !== collection) {
    throw new Error(
      `Policy returned a filter for "${ast.collection ?? ""}" while authorizing "${collection}"`,
    );
  }
}

function getPath(
  record: Readonly<Record<string, unknown>>,
  path: readonly string[],
): unknown {
  let current: unknown = record;
  for (const part of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function compare(actual: unknown, node: FilterConditionNode): boolean {
  const expected = node.value;
  switch (node.operator) {
    case "$eq":
      return actual === expected;
    case "$ne":
    case "$neq":
      return actual !== expected;
    case "$in":
      return Array.isArray(expected) && expected.includes(actual);
    case "$notIn":
      return Array.isArray(expected) && !expected.includes(actual);
    case "$gt":
      return (actual as never) > (expected as never);
    case "$gte":
      return (actual as never) >= (expected as never);
    case "$lt":
      return (actual as never) < (expected as never);
    case "$lte":
      return (actual as never) <= (expected as never);
    case "$empty":
      return (
        actual == null ||
        actual === "" ||
        (Array.isArray(actual) && !actual.length)
      );
    case "$notEmpty":
      return !(
        actual == null ||
        actual === "" ||
        (Array.isArray(actual) && !actual.length)
      );
    case "$isTruly":
      return actual === true;
    case "$isFalsy":
      return actual === false;
    default:
      throw new Error(`Record evaluation does not support ${node.operator}`);
  }
}

function matchesNode(
  node: FilterNode,
  record: Readonly<Record<string, unknown>>,
): boolean {
  if (node.kind === "condition") {
    return compare(getPath(record, node.path), node);
  }
  if (node.kind === "relation") {
    throw new Error("Record evaluation does not support relation filters");
  }
  if (node.kind === "membership") {
    throw new Error("Record evaluation requires a membership resolver");
  }
  const results = node.items.map((item) => matchesNode(item, record));
  return node.logic === "and" ? results.every(Boolean) : results.some(Boolean);
}

export type FilterMembershipResolver = (
  node: FilterMembershipNode,
  value: unknown,
) => boolean | Promise<boolean>;

async function matchesNodeAsync(
  node: FilterNode,
  record: Readonly<Record<string, unknown>>,
  resolveMembership: FilterMembershipResolver,
): Promise<boolean> {
  if (node.kind === "condition") {
    return compare(getPath(record, node.path), node);
  }
  if (node.kind === "relation") {
    throw new Error("Record evaluation does not support relation filters");
  }
  if (node.kind === "membership") {
    return resolveMembership(node, getPath(record, node.path));
  }
  for (const item of node.items) {
    const matched = await matchesNodeAsync(item, record, resolveMembership);
    if (node.logic === "and" && !matched) {
      return false;
    }
    if (node.logic === "or" && matched) {
      return true;
    }
  }
  return node.logic === "and";
}

export function matchesFilter(
  ast: FilterAst,
  record: Readonly<Record<string, unknown>>,
): boolean {
  assertValidFilter(ast);
  return matchesNode(ast.root, record);
}

export async function matchesFilterAsync(
  ast: FilterAst,
  record: Readonly<Record<string, unknown>>,
  resolveMembership: FilterMembershipResolver,
): Promise<boolean> {
  assertValidFilter(ast);
  return matchesNodeAsync(ast.root, record, resolveMembership);
}
