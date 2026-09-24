import type {
  AuthorizationOptions,
  AuthorizationOptionsResponse,
  ResourceGroupOption,
  ResourceOption,
  SectionOption,
  SelectOption,
  SubsectionOption,
} from '../client/authorization-client.js';

const builtIn: readonly Omit<SectionOption, 'subsections'>[] = [
  { value: 'pages', label: 'Page permissions', order: 0 },
  { value: 'business', label: 'Business permissions', order: 100 },
  { value: 'administration', label: 'Administration', order: 200 },
];

/** The built-in sections with no subsections, as the workspace receives them. */
export const sections: readonly SectionOption[] = builtIn.map((section) => ({
  ...section,
  subsections: [],
}));

/** The built-in sections holding `subsections`, keyed by section name. */
export function withSubsections(
  subsections: Readonly<Record<string, readonly SubsectionOption[]>>,
): readonly SectionOption[] {
  return builtIn.map((section) => ({
    ...section,
    subsections: subsections[section.value] ?? [],
  }));
}

/** A subsection; its actions default to every action its resources name. */
export function subsection(
  value: string,
  label: string,
  resources: readonly ResourceOption[],
  extra: Partial<Omit<SubsectionOption, 'value' | 'label' | 'resources'>> = {},
): SubsectionOption {
  return {
    value,
    label,
    groups: [],
    actions: [
      ...new Map(
        resources
          .flatMap((item) => item.actions ?? [])
          .map((item) => [item.value, item]),
      ).values(),
    ],
    resources,
    ...extra,
  };
}

/** The page subsection the server lists, holding `pages`. */
export function pageSubsection(
  pages: readonly Omit<ResourceOption, 'type'>[] = [],
  groups: readonly ResourceGroupOption[] = [],
): SubsectionOption {
  return {
    value: 'page',
    label: 'Pages',
    recordType: 'page',
    actions: [{ value: 'access', label: 'Access' }],
    groups,
    resources: pages.map((page) => ({ ...page, type: 'page' })),
  };
}

/** The same sections as the server sends them. */
export const rawSections: readonly {
  name: string;
  title: { key: string; ns: string };
  order: number;
  subsections: [];
}[] = builtIn.map((section) => ({
  name: section.value,
  title: { key: `sections.${section.value}`, ns: '@nocobase/authorization' },
  order: section.order,
  subsections: [],
}));

/** A workspace model as the `options` route would send it, labels as literal titles. */
export function wire(
  options: AuthorizationOptions,
): AuthorizationOptionsResponse {
  const groups = new Map<
    string,
    { name: string; title: string; parent?: string }
  >();
  const collect = (
    nodes: readonly ResourceGroupOption[],
    parent?: string,
  ): void => {
    for (const node of nodes) {
      groups.set(node.value, {
        name: node.value,
        title: node.label,
        ...(parent === undefined ? {} : { parent }),
      });
      collect(node.children ?? [], node.value);
    }
  };
  for (const section of options.sections)
    for (const item of section.subsections)
      if (!item.recordType) collect(item.groups);
  return {
    sections: options.sections.map((section) => ({
      name: section.value,
      title: section.label,
      order: section.order,
      subsections: section.subsections.map((item) => ({
        name: item.value,
        title: item.label,
        ...(item.recordType
          ? {
              recordType: {
                type: item.recordType,
                actions: item.actions.map(action),
              },
            }
          : {}),
        resources: item.recordType
          ? []
          : item.resources.map((resource) => ({
              type: resource.type,
              id: resource.value,
              title: resource.label,
              ...(resource.description === undefined
                ? {}
                : { description: resource.description }),
              ...(resource.group === undefined
                ? {}
                : { group: resource.group }),
              actions: (resource.actions ?? item.actions).map(action),
              ...(resource.dataScopes
                ? {
                    dataScopes: Object.fromEntries(
                      Object.entries(resource.dataScopes).map(
                        ([name, scopes]) => [
                          name,
                          scopes.map((scope) => ({
                            key: scope.key,
                            title: scope.label,
                            collection: scope.collection,
                            fields: scope.collectionFields,
                            recordAccess: scope.options
                              .map((option) => option.value)
                              .filter((value) => value !== ''),
                            defaultValue: scope.defaultValue,
                          })),
                        ],
                      ),
                    ),
                  }
                : {}),
            })),
      })),
    })),
    ...(groups.size ? { resourceGroups: [...groups.values()] } : {}),
    subjectTypes: options.subjectTypes.map((type) => ({
      type: type.value,
      title: type.label,
      selection: type.selection ?? { type: 'collection' },
    })),
    recordAccess: options.recordAccess.map((entry) => ({
      key: entry.value,
      title: entry.label,
      ...(entry.description === undefined
        ? {}
        : { description: entry.description }),
      collections: [],
    })),
    collections: options.collections,
  };
}

function action(entry: SelectOption): { name: string; title: string } {
  return { name: entry.value, title: entry.label };
}
