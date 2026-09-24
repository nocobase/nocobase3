import type { AuthorizationTitle } from './titles.js';

const LIBRARY_NAMESPACE = '@nocobase/authorization';
const OTHER = 'other';

/** A left-side workspace area. Display only. */
export interface Section {
  readonly name: string;
  readonly title: AuthorizationTitle;
  /** Required on a top-level section; optional on a subsection. */
  readonly order?: number;
  /** The top-level section a subsection sits in. */
  readonly parent?: string;
}

/** A top-level section with its subsections, in order. */
export interface SectionTreeNode extends Section {
  readonly order: number;
  readonly subsections: readonly Section[];
}

/** A right-side heading resources are listed under. Display only. */
export interface ResourceGroup {
  readonly name: string;
  readonly title: AuthorizationTitle;
  readonly parent?: string;
  readonly order?: number;
}

/** What `sections.add` takes. */
export interface SectionDefinition extends Section {
  /**
   * Subsections only: extend a subsection another plugin owns, the way a
   * client settings group is extended. Does nothing when the subsection
   * exists, creates it otherwise, and yields to the owner's later add.
   */
  readonly extend?: boolean;
}

/**
 * Sections and their subsections, nested exactly one level. Re-adding a
 * deep-equal section is a no-op; anything else throws, unless one side of a
 * subsection add is an `extend`.
 */
export class SectionRegistry {
  private readonly entries = new Map<string, Section>();
  /** Subsections created by an `extend` add and not yet claimed by an owner. */
  private readonly extended = new Set<string>();

  add(definition: SectionDefinition): void {
    const { extend = false, ...section } = definition;
    if (!section.name) throw new TypeError('A section needs a name');
    if (section.order !== undefined && !Number.isFinite(section.order))
      throw new TypeError(`Section ${section.name} needs a finite order`);
    if (section.parent === undefined) {
      if (extend)
        throw new TypeError(
          `Section ${section.name} can extend only as a subsection`,
        );
      if (section.order === undefined)
        throw new TypeError(`Section ${section.name} needs an order`);
    } else {
      const parent = this.entries.get(section.parent);
      if (!parent)
        throw new Error(
          `Section ${section.name} names an unknown parent: ${section.parent}`,
        );
      if (parent.parent !== undefined)
        throw new Error(
          `Section ${section.name} cannot nest under subsection ${section.parent}`,
        );
    }
    const existing = this.entries.get(section.name);
    if (existing) {
      if (extend) return;
      if (this.extended.has(section.name)) {
        if (existing.parent !== section.parent)
          throw new Error(
            `Section ${section.name} is already registered under ${existing.parent}`,
          );
        this.extended.delete(section.name);
        this.entries.set(section.name, structuredClone(section));
        return;
      }
      if (samePlainData(existing, section)) return;
      throw new Error(`Section already registered: ${section.name}`);
    }
    this.entries.set(section.name, structuredClone(section));
    if (extend) this.extended.add(section.name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Whether `name` is a subsection, the only kind a resource may name. */
  isSubsection(name: string): boolean {
    return this.entries.get(name)?.parent !== undefined;
  }

  get(name: string): Section | undefined {
    const section = this.entries.get(name);
    return section && structuredClone(section);
  }

  /**
   * The "Other" subsection of a top-level section, created on first use; it
   * holds the resources that name no subsection.
   */
  other(parent: string): string {
    const name = `${parent}.${OTHER}`;
    this.add({
      name,
      title: { key: 'sections.other', ns: LIBRARY_NAMESPACE },
      parent,
      order: Number.MAX_SAFE_INTEGER,
    });
    return name;
  }

  /** Top-level sections by `order`, each with its subsections by `order`, unordered ones last. */
  tree(): readonly SectionTreeNode[] {
    const all = [...this.entries.values()];
    const byOrder = (left: Section, right: Section): number =>
      (left.order ?? Number.MAX_SAFE_INTEGER - 1) -
      (right.order ?? Number.MAX_SAFE_INTEGER - 1);
    return structuredClone(
      all
        .filter((section) => section.parent === undefined)
        .sort(byOrder)
        .map((section) => ({
          ...section,
          order: section.order ?? 0,
          subsections: all
            .filter((child) => child.parent === section.name)
            .sort(byOrder),
        })),
    );
  }
}

/** Resource groups, nested to any depth. Re-adding a deep-equal group is a no-op. */
export class ResourceGroupRegistry {
  private readonly entries = new Map<string, ResourceGroup>();

  add(group: ResourceGroup): void {
    if (!group.name) throw new TypeError('A resource group needs a name');
    if (group.order !== undefined && !Number.isFinite(group.order))
      throw new TypeError(`Resource group ${group.name} needs a finite order`);
    if (group.parent !== undefined && !this.entries.has(group.parent))
      throw new Error(
        `Resource group ${group.name} names an unknown parent: ${group.parent}`,
      );
    const existing = this.entries.get(group.name);
    if (existing) {
      if (samePlainData(existing, { ...group })) return;
      throw new Error(`Resource group already registered: ${group.name}`);
    }
    this.entries.set(group.name, structuredClone({ ...group }));
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  get(name: string): ResourceGroup | undefined {
    const group = this.entries.get(name);
    return group && structuredClone(group);
  }

  list(): readonly ResourceGroup[] {
    return structuredClone([...this.entries.values()]);
  }
}

/** Deep equality for the plain data registries hold; browser-safe, unlike `node:util`. */
function samePlainData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    left === null ||
    right === null ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).filter(
    (key) => leftRecord[key] !== undefined,
  );
  const rightKeys = Object.keys(rightRecord).filter(
    (key) => rightRecord[key] !== undefined,
  );
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        samePlainData(leftRecord[key], rightRecord[key]),
    )
  );
}
