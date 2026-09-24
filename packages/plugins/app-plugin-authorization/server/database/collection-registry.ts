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
  /** Re-adding an identical definition is a no-op; a different one throws. */
  add(definition: DatabaseCollectionDefinition): void;
  has(name: string): boolean;
  list(): readonly DatabaseCollectionDefinition[];
}

/** The `database.collection` items. Registration is the opt-in. */
export class DatabaseCollectionRegistry implements DatabaseCollections {
  readonly items: ResourceItems = new ResourceItems();
  private readonly definitions = new Map<
    string,
    DatabaseCollectionDefinition
  >();

  add(definition: DatabaseCollectionDefinition): void {
    if (!definition.name)
      throw new TypeError('A database collection registration needs a name');
    const existing = this.definitions.get(definition.name);
    if (existing) {
      if (isDeepStrictEqual(existing, { ...definition })) return;
      throw new Error(
        `Database collection already registered: ${definition.name}`,
      );
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
}
