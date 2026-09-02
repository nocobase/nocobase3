import type {
  CollectionDefinition,
  CollectionKind,
  NamingOptions,
} from '../types.js';
import {
  CollectionResolver,
  CollectionResolutionError,
  type CollectionResolutionResult,
} from '../resolver/index.js';
import type {
  CollectionMetadataStore,
  CollectionMetadataInvalidation,
  CollectionMetadataInvalidator,
} from '../../metadata/index.js';
import { DefaultNamingStrategy } from '../../naming/default-strategy.js';
import type { SchemaInspector } from '../../schema/inspector/inspector.js';
import type {
  PhysicalCollectionKind,
  PhysicalCollectionSchema,
  PhysicalCollectionSummary,
} from '../../schema/inspector/types.js';
import { CollectionNamingIndex } from './naming-index.js';
import { CollectionRelationValidator } from './relation-validator.js';
import type {
  CollectionSummary,
  CollectionSummaryPage,
  ConnectionCollections,
  ListCollectionsOptions,
  ScanCollectionsOptions,
} from './types.js';

export interface CollectionRegistryOptions {
  readonly inspector: SchemaInspector;
  readonly metadataStore: CollectionMetadataStore;
  readonly naming?: NamingOptions;
  readonly resolver?: CollectionResolver;
  readonly isInternalPhysicalCollection?: (identity: {
    readonly tableName: string;
    readonly schema: string;
  }) => boolean;
}

export class CollectionRegistry
  implements ConnectionCollections, CollectionMetadataInvalidator
{
  private readonly cache = new Map<string, CollectionResolutionResult>();
  private readonly inFlight = new Map<
    string,
    Promise<CollectionResolutionResult | undefined>
  >();
  private readonly resolver: CollectionResolver;
  private generation = 0;
  private readonly collectionGenerations = new Map<string, number>();
  private namingIndexPromise?: Promise<CollectionNamingIndex>;
  private initializationPromise?: Promise<void>;
  private readonly relationValidator: CollectionRelationValidator;

  constructor(private readonly options: CollectionRegistryOptions) {
    this.resolver = options.resolver ?? new CollectionResolver();
    this.relationValidator = new CollectionRelationValidator({
      get: (name) => this.get(name),
      scan: () => this.scan(),
    });
  }

  async initialize(): Promise<void> {
    if (!this.initializationPromise) {
      const initializing = this.options.metadataStore.initialize();
      this.initializationPromise = initializing.catch((error: unknown) => {
        this.initializationPromise = undefined;
        throw error;
      });
    }
    await this.initializationPromise;
  }

  async get(name: string): Promise<CollectionDefinition | undefined> {
    return (await this.getResolution(name))?.collection;
  }

  async getResolution(
    name: string,
  ): Promise<CollectionResolutionResult | undefined> {
    const result = await this.getResolutionInternal(name);
    return result ? structuredClone(result) : undefined;
  }

  private async getResolutionInternal(
    name: string,
  ): Promise<CollectionResolutionResult | undefined> {
    validateName(name);
    const cached = this.cache.get(name);
    if (cached) return cached;
    const loading = this.inFlight.get(name);
    if (loading) return loading;

    const token = this.generationToken(name);
    const promise = this.load(name).then((result) => {
      if (result && this.sameGeneration(name, token)) {
        this.cache.set(name, result);
      }
      return result;
    });
    this.inFlight.set(name, promise);
    try {
      return await promise;
    } finally {
      if (this.inFlight.get(name) === promise) this.inFlight.delete(name);
    }
  }

  async list(
    options: ListCollectionsOptions = {},
  ): Promise<CollectionSummaryPage> {
    await this.initialize();
    const index = await this.namingIndex();
    const limit = options.limit ?? 100;
    const tableNamePrefixes = index.physicalTableNamePrefixes(
      options.tableNamePrefixes,
    );
    const seen = new Map<string, PhysicalCollectionSummary>();
    const items: CollectionSummary[] = [];
    let cursor = options.cursor;
    let nextCursor: string | undefined;
    do {
      const page = await this.options.inspector.listPhysicalCollections({
        ...options,
        tableNamePrefixes,
        limit: limit - items.length,
        cursor,
      });
      for (const physical of page.items) {
        if (this.options.isInternalPhysicalCollection?.(physical)) continue;
        const identity = index.resolvePhysicalCollection(physical);
        if (!identity) throw physicalNameError(physical);
        const duplicate = seen.get(identity.name);
        if (
          duplicate &&
          (duplicate.tableName !== physical.tableName ||
            duplicate.schema !== physical.schema)
        ) {
          throw logicalNameConflict(identity.name, duplicate, physical);
        }
        seen.set(identity.name, physical);
        const metadata = index.metadata(identity.name);
        items.push(summarize(physical, identity.name, metadata));
      }
      nextCursor = page.nextCursor;
      cursor = nextCursor;
    } while (items.length < limit && nextCursor);
    return nextCursor ? { items, nextCursor } : { items };
  }

  async *scan(
    options: ScanCollectionsOptions = {},
  ): AsyncIterable<CollectionDefinition> {
    await this.initialize();
    const index = await this.namingIndex();
    const tableNamePrefixes = index.physicalTableNamePrefixes(
      options.tableNamePrefixes,
    );
    const seen = new Map<string, PhysicalCollectionSchema>();
    for await (const physical of this.options.inspector.scanPhysicalCollections(
      { ...options, tableNamePrefixes },
    )) {
      if (this.options.isInternalPhysicalCollection?.(physical)) continue;
      const identity = index.resolvePhysicalCollection(physical);
      if (!identity) throw physicalNameError(physical);
      const duplicate = seen.get(identity.name);
      if (
        duplicate &&
        (duplicate.tableName !== physical.tableName ||
          duplicate.schema !== physical.schema)
      ) {
        throw logicalNameConflict(identity.name, duplicate, physical);
      }
      seen.set(identity.name, physical);
      const stored = await this.options.metadataStore.get(identity.name);
      const token = this.generationToken(identity.name);
      const result = this.resolver.resolve({
        physical,
        metadata: stored?.document,
        naming: this.options.naming,
        context: index,
      });
      if (this.sameGeneration(identity.name, token)) {
        this.cache.set(identity.name, result);
      }
      yield structuredClone(result.collection);
    }
  }

  async refresh(name: string): Promise<CollectionDefinition | undefined> {
    this.invalidate(name);
    return this.get(name);
  }

  invalidate(name?: string): void;
  invalidate(change: CollectionMetadataInvalidation): void;
  invalidate(input?: string | CollectionMetadataInvalidation): void {
    if (typeof input === 'string') {
      this.bumpCollectionGeneration(input);
      this.cache.delete(input);
      this.inFlight.delete(input);
      return;
    }
    if (input) {
      for (const name of input.collections) {
        this.bumpCollectionGeneration(name);
        this.cache.delete(name);
        this.inFlight.delete(name);
      }
      if (input.namingIndex) this.namingIndexPromise = undefined;
      return;
    }
    this.invalidateAll();
  }

  invalidateAll(): void {
    this.generation += 1;
    this.collectionGenerations.clear();
    this.cache.clear();
    this.inFlight.clear();
    this.namingIndexPromise = undefined;
  }

  async validateRelations(name?: string): Promise<void> {
    await this.relationValidator.validateGraph(name);
  }

  private async load(
    name: string,
  ): Promise<CollectionResolutionResult | undefined> {
    const index = await this.namingIndex();
    const identity = index.resolveLogicalCollection(name);
    const [physical, stored] = await Promise.all([
      this.options.inspector.getPhysicalCollection({
        tableName: identity.tableName,
      }),
      this.options.metadataStore.get(name),
    ]);
    if (physical && this.options.isInternalPhysicalCollection?.(physical)) {
      return undefined;
    }
    if (!physical) {
      if (stored) {
        throw new CollectionResolutionError([
          {
            code: 'COLLECTION_SCHEMA_DRIFT',
            path: ['metadata', name],
            message: `Metadata Collection "${name}" maps to missing physical table "${identity.tableName}".`,
          },
        ]);
      }
      return undefined;
    }
    if (identity.metadata) {
      const defaultTableName = new DefaultNamingStrategy(
        this.options.naming,
      ).collectionToTableName(name);
      if (defaultTableName !== identity.tableName) {
        const conflicting = await this.options.inspector.getPhysicalCollection({
          tableName: defaultTableName,
        });
        if (conflicting) {
          throw logicalNameConflict(name, conflicting, physical);
        }
      }
    }
    return this.resolver.resolve({
      physical,
      metadata: stored?.document,
      naming: this.options.naming,
      context: index,
    });
  }

  private namingIndex(): Promise<CollectionNamingIndex> {
    if (!this.namingIndexPromise) {
      const created = this.initialize().then(() =>
        CollectionNamingIndex.create(
          this.options.metadataStore,
          this.options.naming,
        ),
      );
      this.namingIndexPromise = created.catch((error: unknown) => {
        this.namingIndexPromise = undefined;
        throw error;
      });
    }
    return this.namingIndexPromise;
  }

  private generationToken(name: string): readonly [number, number] {
    return [this.generation, this.collectionGenerations.get(name) ?? 0];
  }

  private sameGeneration(
    name: string,
    token: readonly [number, number],
  ): boolean {
    return (
      token[0] === this.generation &&
      token[1] === (this.collectionGenerations.get(name) ?? 0)
    );
  }

  private bumpCollectionGeneration(name: string): void {
    this.collectionGenerations.set(
      name,
      (this.collectionGenerations.get(name) ?? 0) + 1,
    );
  }
}

function summarize(
  physical: PhysicalCollectionSummary,
  name: string,
  metadata:
    | {
        readonly title?: string;
        readonly description?: string;
      }
    | undefined,
): CollectionSummary {
  const base = {
    name,
    tableName: physical.tableName,
    schema: physical.schema,
    kind: collectionKind(physical.kind),
  };
  return metadata?.title !== undefined || metadata?.description !== undefined
    ? {
        ...base,
        ...(metadata.title !== undefined ? { title: metadata.title } : {}),
        ...(metadata.description !== undefined
          ? { description: metadata.description }
          : {}),
      }
    : base;
}

function collectionKind(kind: PhysicalCollectionKind): CollectionKind {
  if (kind === 'view') return 'view';
  if (kind === 'materializedView') return 'materializedView';
  return 'table';
}

function validateName(name: string): void {
  if (typeof name !== 'string' || name.length === 0 || name.trim() !== name) {
    throw new CollectionResolutionError([
      {
        code: 'COLLECTION_NAME_CONFLICT',
        path: ['name'],
        message:
          'Collection name must be a non-empty string without surrounding whitespace.',
      },
    ]);
  }
}

function physicalNameError(
  physical: PhysicalCollectionSummary,
): CollectionResolutionError {
  return new CollectionResolutionError([
    {
      code: 'COLLECTION_NAME_CONFLICT',
      path: ['physical', physical.schema, physical.tableName],
      message: `Physical Collection "${physical.schema}.${physical.tableName}" cannot be mapped to a logical name.`,
    },
  ]);
}

function logicalNameConflict(
  name: string,
  first: PhysicalCollectionSummary,
  second: PhysicalCollectionSummary,
): CollectionResolutionError {
  return new CollectionResolutionError([
    {
      code: 'COLLECTION_NAME_CONFLICT',
      path: ['collections', name],
      message: `Physical Collections "${first.schema}.${first.tableName}" and "${second.schema}.${second.tableName}" map to the same logical name "${name}".`,
    },
  ]);
}
