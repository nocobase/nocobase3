import type { DatabaseCollectionDefinition } from './model.js';

export class DatabaseCollectionRegistry {
  private readonly collections = new Map<
    string,
    DatabaseCollectionDefinition
  >();

  constructor(private readonly source: string) {}

  add(definition: DatabaseCollectionDefinition): void {
    const name = this.resolveName(definition.name);
    if (this.collections.has(name)) {
      throw new Error(
        `Database authorization collection already registered: ${name}`,
      );
    }
    const fields = new Set(definition.fields);
    for (const [attribute, field] of Object.entries(
      definition.attributes ?? {},
    )) {
      if (!fields.has(field)) {
        throw new Error(
          `Database authorization collection "${name}" maps attribute "${attribute}" to unknown field "${field}"`,
        );
      }
    }
    this.collections.set(name, { ...definition, name });
  }

  get(name: string): DatabaseCollectionDefinition | undefined {
    return this.collections.get(this.resolveName(name));
  }

  list(): readonly DatabaseCollectionDefinition[] {
    return [...this.collections.values()];
  }

  resolveName(name: string): string {
    return name.includes('.') ? name : `${this.source}.${name}`;
  }
}
