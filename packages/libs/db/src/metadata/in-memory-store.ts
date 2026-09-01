import type {
  CollectionDefinition,
  CollectionMetadataPatch,
  FieldMetadataPatch,
} from '../collection/types.js';
import {
  CollectionMetadataFieldNotFoundError,
  type CollectionMetadataStore,
} from './store.js';

export class InMemoryCollectionMetadataStore implements CollectionMetadataStore {
  private readonly collections = new Map<string, CollectionDefinition>();

  async getCollection(name: string): Promise<CollectionDefinition | undefined> {
    return clone(this.collections.get(name));
  }

  async listCollections(): Promise<CollectionDefinition[]> {
    return [...this.collections.values()].map((definition) =>
      clone(definition),
    );
  }

  async saveCollection(
    name: string,
    definition: CollectionDefinition,
  ): Promise<void> {
    this.collections.set(name, clone({ ...definition, name }));
  }

  async removeCollection(name: string): Promise<void> {
    this.collections.delete(name);
  }

  async renameCollection(
    from: string,
    to: string,
    definition: CollectionDefinition,
  ): Promise<void> {
    this.collections.delete(from);
    this.collections.set(to, clone({ ...definition, name: to }));
  }

  async patchCollection(
    name: string,
    patch: CollectionMetadataPatch,
  ): Promise<void> {
    const definition = this.collections.get(name) ?? { name, fields: [] };
    const fields = [...(definition.fields ?? [])];

    for (const [fieldName, fieldPatch] of Object.entries(patch.fields ?? {})) {
      const index = fields.findIndex((field) => field.name === fieldName);
      if (index >= 0) {
        fields[index] = { ...fields[index], ...fieldPatch };
      } else {
        throw new CollectionMetadataFieldNotFoundError(name, fieldName);
      }
    }

    this.collections.set(
      name,
      clone({
        ...definition,
        title: patch.title ?? definition.title,
        description: patch.description ?? definition.description,
        fields,
      }),
    );
  }

  async patchField(
    collection: string,
    field: string,
    patch: FieldMetadataPatch,
  ): Promise<void> {
    await this.patchCollection(collection, {
      fields: {
        [field]: patch,
      },
    });
  }
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
