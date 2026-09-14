import { describe, expect, it } from 'vitest';
import {
  COLLECTION_ARTIFACT_FILE_NAMES,
  COLLECTION_ARTIFACT_FORMAT_VERSION,
  COLLECTION_ARTIFACT_MANIFEST_FILE_NAME,
  serializeCollectionArtifact,
  serializeCollectionArtifactManifest,
  type CollectionArtifactCollectionFile,
  type CollectionArtifactManifest,
  type CollectionArtifactMetadataFile,
  type CollectionArtifactSchemaFile,
  type CollectionResolutionResult,
} from '../../../src/index.js';
import { resolveCollection } from '../../../src/collection/resolver/resolver.js';
import type { CollectionResolutionContext } from '../../../src/collection/resolver/types.js';
import { stableJson } from '../../../src/collection/artifact/stable-json.js';
import { ordersResolverFixture } from '../../fixtures/resolver/orders.js';

const emptyContext: CollectionResolutionContext = {
  resolvePhysicalCollection: () => undefined,
};

function resolveOrders(): CollectionResolutionResult {
  return resolveCollection({
    physical: structuredClone(ordersResolverFixture.physical),
    metadata: ordersResolverFixture.metadata,
    naming: ordersResolverFixture.naming,
    context: emptyContext,
  });
}

/** What JSON keeps of a value: `undefined` members gone, Dates as strings. */
function jsonImage<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('serializeCollectionArtifact', () => {
  it('writes the resolution, the stored document and the physical schema to three files', () => {
    const resolution = resolveOrders();
    const files = serializeCollectionArtifact({
      name: 'orders',
      resolution,
      physical: ordersResolverFixture.physical,
      metadata: ordersResolverFixture.metadata,
    });

    const collection = JSON.parse(
      files.collection,
    ) as CollectionArtifactCollectionFile;
    expect(collection.formatVersion).toBe(COLLECTION_ARTIFACT_FORMAT_VERSION);
    expect(collection.name).toBe('orders');
    expect(collection.collection).toEqual(jsonImage(resolution.collection));
    expect(collection.warnings).toEqual(jsonImage(resolution.warnings));

    const metadata = JSON.parse(
      files.metadata,
    ) as CollectionArtifactMetadataFile;
    expect(metadata.document).toEqual(
      jsonImage(ordersResolverFixture.metadata),
    );

    const schema = JSON.parse(files.schema) as CollectionArtifactSchemaFile;
    expect(schema.physical).toEqual(jsonImage(ordersResolverFixture.physical));
  });

  it('writes a null document when the store holds no supplemental metadata', () => {
    const files = serializeCollectionArtifact({
      name: 'orders',
      resolution: resolveOrders(),
      physical: ordersResolverFixture.physical,
    });
    const metadata = JSON.parse(
      files.metadata,
    ) as CollectionArtifactMetadataFile;
    expect(metadata.document).toBeNull();
  });

  it('produces byte-identical output regardless of key insertion order or warning order', () => {
    const resolution = resolveOrders();
    const reversedKeys = Object.fromEntries(
      Object.entries(resolution.collection).reverse(),
    ) as CollectionResolutionResult['collection'];
    const warnings = [
      { code: 'B' as never, message: 'second', path: ['fields', 1] },
      { code: 'A' as never, message: 'first' },
    ];
    const left = serializeCollectionArtifact({
      name: 'orders',
      resolution: { ...resolution, warnings },
      physical: ordersResolverFixture.physical,
    });
    const right = serializeCollectionArtifact({
      name: 'orders',
      resolution: {
        ...resolution,
        collection: reversedKeys,
        warnings: [...warnings].reverse(),
      },
      physical: ordersResolverFixture.physical,
    });
    expect(right).toEqual(left);
    const parsed = JSON.parse(
      left.collection,
    ) as CollectionArtifactCollectionFile;
    expect(parsed.warnings.map((warning) => warning.code)).toEqual(['A', 'B']);
  });

  it('keeps the order of fields, which is the column order', () => {
    const resolution = resolveOrders();
    const fieldNames = resolution.collection.fields?.map((field) => field.name);
    expect(fieldNames?.length).toBeGreaterThan(1);
    const files = serializeCollectionArtifact({
      name: 'orders',
      resolution,
      physical: ordersResolverFixture.physical,
    });
    const parsed = JSON.parse(
      files.collection,
    ) as CollectionArtifactCollectionFile;
    expect(parsed.collection.fields?.map((field) => field.name)).toEqual(
      fieldNames,
    );
  });

  it('names its files as the manifest and the readers expect', () => {
    expect(COLLECTION_ARTIFACT_FILE_NAMES).toEqual({
      collection: 'collection.json',
      metadata: 'metadata.json',
      schema: 'schema.json',
    });
    expect(COLLECTION_ARTIFACT_MANIFEST_FILE_NAME).toBe('_manifest.json');
  });
});

describe('serializeCollectionArtifactManifest', () => {
  it('sorts the collection list and records the database state it was read from', () => {
    const text = serializeCollectionArtifactManifest({
      connection: 'main',
      dialect: 'sqlite',
      migrationHead: '202609080001_create_articles',
      collections: ['orders', 'articles'],
    });
    const manifest = JSON.parse(text) as CollectionArtifactManifest;
    expect(manifest).toEqual({
      formatVersion: 1,
      connection: 'main',
      dialect: 'sqlite',
      migrationHead: '202609080001_create_articles',
      collections: ['articles', 'orders'],
    });
    expect(text.endsWith('\n')).toBe(true);
    expect(Object.keys(manifest)).toEqual([...Object.keys(manifest)].sort());
  });

  it('keeps a null migration head for a connection without history', () => {
    const manifest = JSON.parse(
      serializeCollectionArtifactManifest({
        connection: 'external',
        dialect: 'postgres',
        migrationHead: null,
        collections: [],
      }),
    ) as CollectionArtifactManifest;
    expect(manifest.migrationHead).toBeNull();
    expect(manifest.collections).toEqual([]);
  });
});

describe('stableJson', () => {
  it('sorts keys recursively, drops undefined members and preserves array order', () => {
    expect(
      stableJson({
        b: [{ z: 1, a: undefined }, { y: 2 }],
        a: { d: undefined, c: null },
      }),
    ).toBe(
      `${JSON.stringify({ a: { c: null }, b: [{ z: 1 }, { y: 2 }] }, null, 2)}\n`,
    );
  });

  it('writes Dates as ISO strings and refuses values JSON cannot carry', () => {
    expect(stableJson({ at: new Date(0) })).toContain(
      '"at": "1970-01-01T00:00:00.000Z"',
    );
    expect(() => stableJson({ nested: { big: 1n } })).toThrow(
      /bigint at "nested.big"/,
    );
    expect(() => stableJson({ fn: () => 1 })).toThrow(/function at "fn"/);
  });
});
