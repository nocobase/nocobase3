import type { AuthorizationTitle } from './titles.js';

/** A workspace area that lists resource types. Display only. */
export interface Section {
  readonly name: string;
  readonly title: AuthorizationTitle;
  readonly order: number;
}

/** A heading that items are listed under. Display only. */
export interface ResourceGroup {
  readonly name: string;
  readonly title: AuthorizationTitle;
}

/** Add-only: re-adding an identical section is a no-op, anything else throws. */
export class SectionRegistry {
  private readonly entries = new Map<string, Section>();

  add(section: Section): void {
    if (!section.name) throw new TypeError('A section needs a name');
    if (!Number.isFinite(section.order))
      throw new TypeError(`Section ${section.name} needs a finite order`);
    const existing = this.entries.get(section.name);
    if (existing) {
      if (samePlainData(existing, { ...section })) return;
      throw new Error(`Section already registered: ${section.name}`);
    }
    this.entries.set(section.name, structuredClone({ ...section }));
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  get(name: string): Section | undefined {
    const section = this.entries.get(name);
    return section && structuredClone(section);
  }

  /** Sorted by `order`, then by name. */
  list(): readonly Section[] {
    return structuredClone(
      [...this.entries.values()].sort(
        (left, right) =>
          left.order - right.order || left.name.localeCompare(right.name),
      ),
    );
  }
}

/** Re-adding a group with the same title is a no-op; a different title throws. */
export class ResourceGroupRegistry {
  private readonly entries = new Map<string, ResourceGroup>();

  add(group: ResourceGroup): void {
    if (!group.name) throw new TypeError('A resource group needs a name');
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
