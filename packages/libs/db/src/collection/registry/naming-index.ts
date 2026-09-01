import type { NamingOptions } from '../types.js';
import type {
  CollectionNamingIdentity,
  CollectionResolutionContext,
} from '../resolver/types.js';
import { CollectionResolutionError } from '../resolver/errors.js';
import type {
  CollectionMetadataDocumentStore,
  CollectionMetadataSummary,
} from '../../metadata/document-store.js';
import { DefaultNamingStrategy } from '../../naming/default-strategy.js';
import type { PhysicalCollectionIdentity } from '../../schema/inspector/types.js';

export interface IndexedCollectionIdentity extends CollectionNamingIdentity {
  readonly tableName: string;
  readonly metadata?: CollectionMetadataSummary;
}

export class CollectionNamingIndex implements CollectionResolutionContext {
  private constructor(
    private readonly naming: Required<NamingOptions>,
    private readonly byName: ReadonlyMap<string, IndexedCollectionIdentity>,
    private readonly byTableName: ReadonlyMap<
      string,
      IndexedCollectionIdentity
    >,
  ) {}

  static async create(
    store: CollectionMetadataDocumentStore,
    naming: NamingOptions = {},
    overrides: readonly CollectionMetadataSummary[] = [],
  ): Promise<CollectionNamingIndex> {
    const summaries: CollectionMetadataSummary[] = [];
    let cursor: string | undefined;
    do {
      const page = await store.list({ limit: 1000, cursor });
      summaries.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    for (const override of overrides) {
      const index = summaries.findIndex((item) => item.name === override.name);
      if (index >= 0) summaries[index] = override;
      else summaries.push(override);
    }

    const effectiveDefault = effectiveNaming(naming);
    const byName = new Map<string, IndexedCollectionIdentity>();
    const byTableName = new Map<string, IndexedCollectionIdentity>();
    for (const summary of summaries) {
      const effective = effectiveNaming(naming, summary.naming);
      const tableName = new DefaultNamingStrategy(
        effective,
      ).collectionToTableName(summary.name);
      const identity: IndexedCollectionIdentity = {
        name: summary.name,
        naming: effective,
        tableName,
        metadata: summary,
      };
      const conflicting = byTableName.get(tableName);
      if (conflicting && conflicting.name !== summary.name) {
        throw new CollectionResolutionError([
          {
            code: 'COLLECTION_NAME_CONFLICT',
            path: ['metadata', summary.name, 'naming'],
            message: `Collections "${conflicting.name}" and "${summary.name}" map to the same physical table "${tableName}".`,
          },
        ]);
      }
      byName.set(summary.name, identity);
      byTableName.set(tableName, identity);
    }
    return new CollectionNamingIndex(effectiveDefault, byName, byTableName);
  }

  resolveLogicalCollection(name: string): IndexedCollectionIdentity {
    return (
      this.byName.get(name) ?? {
        name,
        naming: this.naming,
        tableName: new DefaultNamingStrategy(this.naming).collectionToTableName(
          name,
        ),
      }
    );
  }

  resolvePhysicalCollection(
    identity: PhysicalCollectionIdentity,
  ): CollectionNamingIdentity | undefined {
    const explicit = this.byTableName.get(identity.tableName);
    if (explicit) return explicit;
    const prefix = this.naming.tablePrefix;
    if (!identity.tableName.startsWith(prefix)) return undefined;
    const unprefixed = identity.tableName.slice(prefix.length);
    const name = reverseIdentifier(unprefixed, this.naming.underscored);
    if (!name) return undefined;
    const strategy = new DefaultNamingStrategy(this.naming);
    if (strategy.collectionToTableName(name) !== identity.tableName) {
      return undefined;
    }
    const explicitLogical = this.byName.get(name);
    if (explicitLogical) {
      throw new CollectionResolutionError([
        {
          code: 'COLLECTION_NAME_CONFLICT',
          path: ['physical', identity.schema, identity.tableName],
          message: `Physical Collection "${identity.schema}.${identity.tableName}" maps to logical name "${name}", which Metadata maps to "${explicitLogical.tableName}".`,
        },
      ]);
    }
    return { name, naming: this.naming };
  }

  metadata(name: string): CollectionMetadataSummary | undefined {
    return this.byName.get(name)?.metadata;
  }
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

function reverseIdentifier(
  physicalName: string,
  underscored: boolean,
): string | undefined {
  if (!physicalName) return undefined;
  return underscored
    ? physicalName.replace(/_([a-z])/g, (_match: string, character: string) =>
        character.toUpperCase(),
      )
    : physicalName;
}
