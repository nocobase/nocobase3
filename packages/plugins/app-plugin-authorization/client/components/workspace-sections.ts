import type {
  AuthorizationOptions,
  ResourceOption,
  SubsectionOption,
} from '../authorization-client.js';

/** One left-side entry: a subsection, or the placeholder of an empty section. */
export interface WorkspaceEntry extends SubsectionOption {
  readonly section: string;
  readonly sectionLabel: string;
  /** Set on the placeholder of a section with nothing to configure. */
  readonly empty?: true;
}

/**
 * The sidebar of the permission workspace, section by section. A section
 * with no resources keeps one placeholder entry, which shows how to add some.
 */
export function workspaceEntries(
  options: AuthorizationOptions,
): readonly WorkspaceEntry[] {
  return options.sections.flatMap((section) => {
    const subsections = section.subsections.filter(
      (item) => item.resources.length > 0,
    );
    const entries = subsections.length
      ? subsections
      : [
          {
            value: section.value,
            label: section.label,
            actions: [],
            groups: [],
            resources: [],
            empty: true as const,
          },
        ];
    return entries.map((entry) => ({
      ...entry,
      section: section.value,
      sectionLabel: section.label,
    }));
  });
}

/** The entry `?section=` names, else the first with resources. */
export function selectedEntry(
  entries: readonly WorkspaceEntry[],
  value: string | null,
): WorkspaceEntry | undefined {
  return (
    entries.find((entry) => entry.value === value) ??
    entries.find((entry) => entry.resources.length > 0) ??
    entries[0]
  );
}

/** What the configured shield of an entry reads: the subject's grants. */
export interface ConfiguredGrants {
  readonly unrestricted?: boolean;
  /** Types granted with `*`. */
  readonly types: ReadonlySet<string>;
  /** `type\0id` of every granted resource. */
  readonly resources: ReadonlySet<string>;
}

export function configuredKey(type: string, id: string): string {
  return `${type}\u0000${id}`;
}

/** Whether the subject has anything granted within the entry. */
export function entryConfigured(
  entry: WorkspaceEntry,
  configured: ConfiguredGrants,
): boolean {
  if (entry.empty) return false;
  if (configured.unrestricted) return true;
  if (entry.recordType && configured.types.has(entry.recordType)) return true;
  return entry.resources.some(
    (item: ResourceOption) =>
      configured.types.has(item.type) ||
      configured.resources.has(configuredKey(item.type, item.value)),
  );
}
