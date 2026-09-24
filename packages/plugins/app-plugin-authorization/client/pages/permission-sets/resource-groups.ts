import type {
  ResourceGroupOption,
  ResourceOption,
} from '../../authorization-client.js';

export type ResourceRow =
  | { kind: 'group'; group: ResourceGroupOption; depth: number }
  | { kind: 'item'; item: ResourceOption; depth: number };

export function resourceRows(
  groups: readonly ResourceGroupOption[],
  items: readonly ResourceOption[],
  collapsed: ReadonlySet<string>,
): ResourceRow[] {
  const paths = new Map<string, ResourceGroupOption[]>();
  function index(
    nodes: readonly ResourceGroupOption[],
    parents: ResourceGroupOption[],
  ): void {
    for (const group of nodes) {
      const path = [...parents, group];
      paths.set(group.value, path);
      index(group.children ?? [], path);
    }
  }
  index(groups, []);
  type Node = { row: ResourceRow; children: Node[] };
  const roots: Node[] = [];
  const registered = new Map<string, Node>();
  for (const item of items) {
    const path = item.group ? (paths.get(item.group) ?? []) : [];
    let siblings = roots;
    path.forEach((group, depth) => {
      let node = registered.get(group.value);
      if (!node) {
        node = { row: { kind: 'group', group, depth }, children: [] };
        registered.set(group.value, node);
        siblings.push(node);
      }
      siblings = node.children;
    });
    siblings.push({
      row: { kind: 'item', item, depth: path.length },
      children: [],
    });
  }
  function flatten(nodes: Node[]): ResourceRow[] {
    return nodes.flatMap(({ row, children }) => [
      row,
      ...(row.kind === 'group' && collapsed.has(row.group.value)
        ? []
        : flatten(children)),
    ]);
  }
  return flatten(roots);
}

export function descendantGroups(
  groups: readonly ResourceGroupOption[],
  id: string,
): readonly string[] {
  for (const group of groups) {
    if (group.value === id)
      return [
        id,
        ...(group.children ?? []).flatMap((child) =>
          descendantGroups([child], child.value),
        ),
      ];
    const found = descendantGroups(group.children ?? [], id);
    if (found.length) return found;
  }
  return [];
}
