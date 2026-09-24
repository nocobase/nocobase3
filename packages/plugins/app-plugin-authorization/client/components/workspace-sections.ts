import type {
  AuthorizationOptions,
  ResourceTypeOption,
} from '../authorization-client.js';

/** A resource type as the workspace lists it, with the section it sits in. */
export interface WorkspaceType extends ResourceTypeOption {
  readonly section: string;
  readonly sectionLabel: string;
}

/**
 * Every displayed resource type, section by section in section order. A type
 * without a section is not displayed.
 */
export function workspaceTypes(
  options: AuthorizationOptions,
): readonly WorkspaceType[] {
  return options.sections.flatMap((section) =>
    options.resourceTypes
      .filter((type) => type.section === section.value)
      .map((type) => ({
        ...type,
        section: section.value,
        sectionLabel: section.label,
      })),
  );
}
