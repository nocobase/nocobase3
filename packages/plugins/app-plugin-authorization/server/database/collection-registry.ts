import { isDeepStrictEqual } from 'node:util';
import {
  ResourceItems,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';

/**
 * A collection an application declared part of the permission model. Intent
 * only: fields, primary key and relations are read from db at check time.
 */
export interface DatabaseCollectionDefinition {
  readonly name: string;
  readonly title: AuthorizationTitle;
  readonly description?: AuthorizationTitle;
  /** Defaults to `read`, `create`, `update` and `delete`. */
  readonly actions?: readonly string[];
}

export interface DatabaseCollections {
  /**
   * Re-adding a collection with the same actions is a no-op. A different
   * title or description keeps the first registration and is reported by
   * `warnings()`; different actions throw.
   */
  add(definition: DatabaseCollectionDefinition): void;
  has(name: string): boolean;
  list(): readonly DatabaseCollectionDefinition[];
  /** Re-registrations that differed only in display data, one message each. */
  warnings(): readonly string[];
}

const DEFAULT_ACTIONS: readonly string[] = [
  'read',
  'create',
  'update',
  'delete',
];

const actionsOf = (definition: DatabaseCollectionDefinition): string[] => [
  ...(definition.actions ?? DEFAULT_ACTIONS),
];

/** The `database.collection` items. Registration is the opt-in. */
export class DatabaseCollectionRegistry implements DatabaseCollections {
  readonly items: ResourceItems = new ResourceItems();
  private readonly definitions = new Map<
    string,
    DatabaseCollectionDefinition
  >();
  private readonly reported: string[] = [];

  add(definition: DatabaseCollectionDefinition): void {
    if (!definition.name)
      throw new TypeError('A database collection registration needs a name');
    const existing = this.definitions.get(definition.name);
    if (existing) {
      const [before, after] = [actionsOf(existing), actionsOf(definition)];
      if (!isDeepStrictEqual([...before].sort(), [...after].sort()))
        throw new Error(
          `Database collection ${definition.name} is already registered with actions [${before.join(', ')}]; another registration declares [${after.join(', ')}]`,
        );
      if (
        !isDeepStrictEqual(existing.title, definition.title) ||
        !isDeepStrictEqual(existing.description, definition.description)
      )
        this.reported.push(
          `Database collection ${definition.name} was registered again with a different title or description; the first registration is kept`,
        );
      return;
    }
    this.items.add({
      id: definition.name,
      title: definition.title,
      ...(definition.description === undefined
        ? {}
        : { description: definition.description }),
      ...(definition.actions ? { actions: definition.actions } : {}),
    });
    this.definitions.set(definition.name, structuredClone({ ...definition }));
  }

  has(name: string): boolean {
    return this.definitions.has(name);
  }

  list(): readonly DatabaseCollectionDefinition[] {
    return structuredClone([...this.definitions.values()]);
  }

  warnings(): readonly string[] {
    return [...this.reported];
  }
}
