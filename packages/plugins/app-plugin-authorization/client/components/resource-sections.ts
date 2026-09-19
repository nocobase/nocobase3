import type {
  AuthorizationOptions,
  ResourceTypeOption,
} from '../authorization-client.js';

import type { Translate } from '../i18n.js';

/** Presentation sections keep the real resource type for every API request. */
export function resourceSections(
  options: AuthorizationOptions,
): readonly (ResourceTypeOption & { key: string })[] {
  return options.resourceTypes
    .flatMap((type) =>
      type.value === 'resource' && type.groups?.length
        ? type.groups.map((group) => ({
            ...type,
            key: group.value,
            category: group.category,
            label: group.label,
            groups: [],
            resources: type.resources.filter(
              (item) => item.group === group.value,
            ),
          }))
        : [{ ...type, key: type.value }],
    )
    .sort((a, b) => {
      const order = { pages: 0, business: 1, administration: 2 };
      return order[a.category ?? 'business'] - order[b.category ?? 'business'];
    });
}

/** Keep model-development entry points visible in the permission workspace. */
export function permissionSections(
  options: AuthorizationOptions,
  t: Translate,
): readonly (ResourceTypeOption & { key: string })[] {
  const sections = resourceSections(options).map((section) => ({
    ...section,
    category:
      section.category ??
      (section.value === 'page' ? ('pages' as const) : ('business' as const)),
  }));
  for (const category of ['pages', 'business'] as const) {
    if (sections.some((section) => section.category === category)) continue;
    sections.push({
      key: category === 'pages' ? 'page' : 'empty:business',
      value: category === 'pages' ? 'page' : 'resource',
      category,
      label: t(`permissionWorkspace.categories.${category}`),
      resources: [],
      actions: [],
    });
  }
  return sections.sort((a, b) => {
    const order = { pages: 0, business: 1, administration: 2 };
    return order[a.category] - order[b.category];
  });
}
