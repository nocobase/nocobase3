import type {
  AuthorizationOptions,
  AuthorizationOptionsResponse,
  SectionOption,
} from '../client/authorization-client.js';

/** The built-in sections, as the workspace receives them after localization. */
export const sections: readonly SectionOption[] = [
  { value: 'pages', label: 'Page permissions', order: 0 },
  { value: 'business', label: 'Business permissions', order: 100 },
  { value: 'administration', label: 'Administration', order: 200 },
];

/** The same sections as the server sends them. */
export const rawSections: readonly {
  name: string;
  title: { key: string; ns: string };
  order: number;
}[] = [
  {
    name: 'pages',
    title: { key: 'sections.pages', ns: '@nocobase/authorization' },
    order: 0,
  },
  {
    name: 'business',
    title: { key: 'sections.business', ns: '@nocobase/authorization' },
    order: 100,
  },
  {
    name: 'administration',
    title: { key: 'sections.administration', ns: '@nocobase/authorization' },
    order: 200,
  },
];

/** A workspace model as the `options` route would send it, labels as literal titles. */
export function wire(
  options: AuthorizationOptions,
): AuthorizationOptionsResponse {
  return {
    sections: options.sections.map((section) => ({
      name: section.value,
      title: section.label,
      order: section.order,
    })),
    resourceTypes: options.resourceTypes.map((type) => ({
      type: type.value,
      title: type.label,
      ...(type.section === undefined ? {} : { section: type.section }),
      groups: (type.groups ?? []).map((group) => ({
        name: group.value,
        title: group.label,
      })),
      actions: type.actions.map(action),
      items: type.resources.map((item) => ({
        id: item.value,
        title: item.label,
        ...(item.description === undefined
          ? {}
          : { description: item.description }),
        ...(item.group === undefined ? {} : { group: item.group }),
        actions: (item.actions ?? type.actions).map(action),
        ...(item.dataScopes
          ? {
              dataScopes: Object.fromEntries(
                Object.entries(item.dataScopes).map(([name, scopes]) => [
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
                ]),
              ),
            }
          : {}),
      })),
    })),
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

function action(entry: { value: string; label: string }): {
  name: string;
  title: string;
} {
  return { name: entry.value, title: entry.label };
}
