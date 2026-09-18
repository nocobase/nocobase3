import type {
  AuthorizationOptions,
  ResourceTypeOption,
} from '../authorization-client.js';

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
