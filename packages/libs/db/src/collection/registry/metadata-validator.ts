import type { CollectionDefinition, NamingOptions } from '../types.js';
import { CollectionResolver } from '../resolver/resolver.js';
import { CollectionResolutionError } from '../resolver/errors.js';
import type {
  CollectionMetadataDocumentStore,
  CollectionMetadataDocumentValidator,
  CollectionMetadataValidationContext,
} from '../../metadata/index.js';
import type { CollectionMetadataDocument } from '../../metadata/document.js';
import { DefaultNamingStrategy } from '../../naming/default-strategy.js';
import type { SchemaInspector } from '../../schema/inspector/inspector.js';
import { CollectionNamingIndex } from './naming-index.js';
import { CollectionRelationValidator } from './relation-validator.js';
import type { ConnectionCollections } from './types.js';

export interface RegistryMetadataDocumentValidatorOptions {
  readonly inspector: SchemaInspector;
  readonly metadataStore: CollectionMetadataDocumentStore;
  readonly collections: ConnectionCollections;
  readonly naming?: NamingOptions;
  readonly resolver?: CollectionResolver;
}

export class RegistryMetadataDocumentValidator implements CollectionMetadataDocumentValidator {
  private readonly resolver: CollectionResolver;

  constructor(
    private readonly options: RegistryMetadataDocumentValidatorOptions,
  ) {
    this.resolver = options.resolver ?? new CollectionResolver();
  }

  async validate(
    document: CollectionMetadataDocument,
    _context: CollectionMetadataValidationContext,
  ): Promise<void> {
    const naming = effectiveNaming(this.options.naming, document.naming);
    const tableName = new DefaultNamingStrategy(naming).collectionToTableName(
      document.name,
    );
    const physical = await this.options.inspector.getPhysicalCollection({
      tableName,
    });
    if (!physical) {
      throw new CollectionResolutionError([
        {
          code: 'COLLECTION_SCHEMA_DRIFT',
          path: ['metadata', document.name],
          message: `Physical Collection "${tableName}" for metadata "${document.name}" does not exist.`,
        },
      ]);
    }
    const index = await CollectionNamingIndex.create(
      this.options.metadataStore,
      this.options.naming,
      [
        {
          name: document.name,
          revision: 'pending',
          naming: document.naming,
          title: document.title,
          description: document.description,
        },
      ],
    );
    const resolved = this.resolver.resolve({
      physical,
      metadata: document,
      naming: this.options.naming,
      context: index,
    }).collection;
    const relationValidator = new CollectionRelationValidator({
      get: (name) =>
        name === document.name
          ? Promise.resolve(resolved)
          : this.options.collections.get(name),
      scan: () => oneCollection(resolved),
    });
    await relationValidator.validateCollection(resolved);
  }
}

async function* oneCollection(
  collection: CollectionDefinition,
): AsyncIterable<CollectionDefinition> {
  yield collection;
}

function effectiveNaming(
  connection: NamingOptions = {},
  collection: NamingOptions = {},
): Required<NamingOptions> {
  return {
    underscored: collection.underscored ?? connection.underscored ?? true,
    tablePrefix: collection.tablePrefix ?? connection.tablePrefix ?? '',
  };
}
