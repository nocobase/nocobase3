import type {
  AuthorizationOptions,
  AuthorizationOptionsResponse,
  LocalizedText,
  ResourceGroupOption,
  ResourceOption,
  SelectOption,
  SubsectionOption,
} from '../authorization-client.js';
import {
  AUTHORIZATION_NAMESPACE,
  LIBRARY_NAMESPACE,
  type Translate,
} from '../i18n.js';

/** Translates a server title; the library namespace maps onto this plugin's. */
export function localizedText(value: LocalizedText, t: Translate): string {
  if (typeof value === 'string') return value;
  const ns =
    value.ns === undefined || value.ns === LIBRARY_NAMESPACE
      ? AUTHORIZATION_NAMESPACE
      : value.ns;
  return t(value.key, { ns, defaultValue: value.defaultValue ?? value.key });
}

/** Turns an `options` response into the workspace model. */
export function localizeOptions(
  raw: AuthorizationOptionsResponse,
  t: Translate,
): AuthorizationOptions {
  const text = (value: LocalizedText): string => localizedText(value, t);
  const recordAccess = new Map(
    raw.recordAccess.map((entry) => [entry.key, text(entry.title)]),
  );
  const action = (entry: {
    name: string;
    title: LocalizedText;
  }): SelectOption => ({ value: entry.name, label: text(entry.title) });
  const groups = resourceGroupTree(raw.resourceGroups ?? [], text);
  return {
    sections: [...raw.sections]
      .sort((left, right) => left.order - right.order)
      .map((section) => ({
        value: section.name,
        label: text(section.title),
        order: section.order,
        subsections: section.subsections.map((subsection) => {
          const resources: ResourceOption[] = subsection.resources.map(
            (item) => ({
              type: item.type,
              value: item.id,
              label: text(item.title),
              ...(item.description === undefined
                ? {}
                : { description: text(item.description) }),
              ...(item.group === undefined ? {} : { group: item.group }),
              actions: item.actions.map(action),
              ...(item.dataScopes
                ? {
                    dataScopes: Object.fromEntries(
                      Object.entries(item.dataScopes).map(([name, scopes]) => [
                        name,
                        scopes.map((scope) => ({
                          key: scope.key,
                          label: text(scope.title),
                          collection: scope.collection,
                          collectionFields: scope.fields,
                          defaultValue: scope.defaultValue ?? '',
                          options: [
                            {
                              value: '',
                              label: t('options.defaultAndSharing', {
                                ns: AUTHORIZATION_NAMESPACE,
                              }),
                            },
                            ...scope.recordAccess.map((key) => ({
                              value: key,
                              label: recordAccess.get(key) ?? key,
                            })),
                          ],
                        })),
                      ]),
                    ),
                  }
                : {}),
            }),
          );
          const used = pruneGroups(
            groups,
            new Set(resources.flatMap((item) => item.group ?? [])),
          );
          return {
            value: subsection.name,
            label: text(subsection.title),
            ...(subsection.recordType
              ? { recordType: subsection.recordType.type }
              : {}),
            actions: uniqueActions(
              subsection.recordType
                ? subsection.recordType.actions.map(action)
                : resources.flatMap((item) => item.actions ?? []),
            ),
            groups: used,
            resources: inGroupOrder(used, resources),
          };
        }),
      })),
    subjectTypes: raw.subjectTypes.map((type) => ({
      value: type.type,
      label: text(type.title),
      selection: type.selection,
    })),
    collections: raw.collections,
    recordAccess: raw.recordAccess.map((entry) => ({
      value: entry.key,
      label: text(entry.title),
      ...(entry.description === undefined
        ? {}
        : { description: text(entry.description) }),
    })),
  };
}

function uniqueActions(
  actions: readonly SelectOption[],
): readonly SelectOption[] {
  return [...new Map(actions.map((item) => [item.value, item])).values()];
}

/** Nests groups under their parents; siblings by `order`, then registration. */
function resourceGroupTree(
  groups: readonly {
    name: string;
    title: LocalizedText;
    parent?: string;
    order?: number;
  }[],
  text: (value: LocalizedText) => string,
): readonly ResourceGroupOption[] {
  const children = (parent?: string): readonly ResourceGroupOption[] =>
    groups
      .map((group, index) => ({ group, index }))
      .filter(({ group }) => group.parent === parent)
      .sort(
        (left, right) =>
          (left.group.order ?? 0) - (right.group.order ?? 0) ||
          left.index - right.index,
      )
      .map(({ group }) => {
        const nested = children(group.name);
        return {
          value: group.name,
          label: text(group.title),
          ...(nested.length ? { children: nested } : {}),
        };
      });
  return children(undefined);
}

/** The groups holding one of `names`, directly or through a descendant. */
function pruneGroups(
  groups: readonly ResourceGroupOption[],
  names: ReadonlySet<string>,
): readonly ResourceGroupOption[] {
  return groups.flatMap((group) => {
    const children = pruneGroups(group.children ?? [], names);
    if (!names.has(group.value) && !children.length) return [];
    return [
      {
        value: group.value,
        label: group.label,
        ...(children.length ? { children } : {}),
      },
    ];
  });
}

/** Ungrouped resources first, then each group's in tree order; stable otherwise. */
function inGroupOrder(
  groups: readonly ResourceGroupOption[],
  resources: readonly ResourceOption[],
): readonly ResourceOption[] {
  const position = new Map<string, number>();
  const visit = (nodes: readonly ResourceGroupOption[]): void => {
    for (const node of nodes) {
      position.set(node.value, position.size);
      visit(node.children ?? []);
    }
  };
  visit(groups);
  const rank = (item: ResourceOption): number =>
    item.group === undefined ? -1 : (position.get(item.group) ?? -1);
  return resources
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        rank(left.item) - rank(right.item) || left.index - right.index,
    )
    .map(({ item }) => item);
}

/** Every subsection, in section order. */
export function workspaceSubsections(
  options: AuthorizationOptions,
): readonly SubsectionOption[] {
  return options.sections.flatMap((section) => section.subsections);
}

/** The resource with this type and id, wherever it is listed. */
export function findResource(
  options: AuthorizationOptions,
  resource: { type: string; id: string },
): ResourceOption | undefined {
  for (const subsection of workspaceSubsections(options)) {
    const found = subsection.resources.find(
      (item) => item.type === resource.type && item.value === resource.id,
    );
    if (found) return found;
  }
  return undefined;
}

/** The actions a resource offers: its own, else its type's. */
export function resourceActions(
  options: AuthorizationOptions,
  resource: { type: string; id?: string },
): readonly SelectOption[] {
  const own =
    resource.id === undefined
      ? undefined
      : findResource(options, { type: resource.type, id: resource.id })
          ?.actions;
  return (
    own ??
    uniqueActions(
      workspaceSubsections(options).flatMap((subsection) =>
        subsection.recordType === resource.type
          ? subsection.actions
          : subsection.resources.flatMap((item) =>
              item.type === resource.type ? (item.actions ?? []) : [],
            ),
      ),
    )
  );
}

/** The data scopes rules can target on one business item, flattened. */
export function dataScopeTargets(
  options: AuthorizationOptions,
  resourceId: string,
): readonly {
  action: string;
  scopeKey: string;
  label: string;
  collection: string;
  recordAccess: readonly string[];
}[] {
  const item = findResource(options, { type: 'business', id: resourceId });
  return Object.entries(item?.dataScopes ?? {}).flatMap(([action, scopes]) =>
    scopes.map((scope) => ({
      action,
      scopeKey: scope.key,
      label: scope.label,
      collection: scope.collection,
      recordAccess: scope.options
        .map((option) => option.value)
        .filter((value) => value !== ''),
    })),
  );
}
