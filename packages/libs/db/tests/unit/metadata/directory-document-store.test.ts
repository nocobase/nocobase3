import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CollectionMetadataValidationError,
  DirectoryCollectionMetadataStore,
  serializeCollectionArtifact,
} from '../../../src/index.js';
import { CollectionMetadataStoreOptionsError } from '../../../src/metadata/document-store-errors.js';
import { CollectionMetadataStoreReadOnlyError } from '../../../src/metadata/document-store-errors.js';
import { resolveCollection } from '../../../src/collection/resolver/resolver.js';
import { ordersResolverFixture } from '../../fixtures/resolver/orders.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function artifactDirectory(): string {
  const directory = mkdtempSync(
    path.join(tmpdir(), 'nocobase-directory-store-'),
  );
  directories.push(directory);
  return directory;
}

function writeMetadataFile(directory: string, name: string, content: string) {
  mkdirSync(path.join(directory, name), { recursive: true });
  writeFileSync(path.join(directory, name, 'metadata.json'), content);
}

const ordersDocument = {
  version: 1 as const,
  name: 'orders',
  title: 'Orders',
  fields: { amount: { title: 'Amount' } },
};

function metadataFile(name: string, document: unknown): string {
  return `${JSON.stringify({ formatVersion: 1, name, document }, null, 2)}\n`;
}

describe('DirectoryCollectionMetadataStore', () => {
  it('reads the metadata.json of every Collection directory', async () => {
    const directory = artifactDirectory();
    writeMetadataFile(
      directory,
      'orders',
      metadataFile('orders', ordersDocument),
    );
    writeMetadataFile(
      directory,
      'customers',
      metadataFile('customers', {
        version: 1,
        name: 'customers',
        title: 'Customers',
      }),
    );
    // Not Collection directories: the manifest, dot entries, and stray files.
    writeFileSync(path.join(directory, '_manifest.json'), '{}\n');
    mkdirSync(path.join(directory, '.staging-x'));
    writeFileSync(path.join(directory, 'README.md'), 'ignored\n');

    const store = new DirectoryCollectionMetadataStore({ directory });
    expect(await store.get('orders')).toEqual({
      document: ordersDocument,
      revision: expect.stringMatching(/^sha256-/),
    });
    expect((await store.list()).items.map((item) => item.name).sort()).toEqual([
      'customers',
      'orders',
    ]);
    expect(await store.get('missing')).toBeUndefined();
  });

  it('treats a missing directory and a null document as no metadata', async () => {
    const directory = artifactDirectory();
    const empty = new DirectoryCollectionMetadataStore({
      directory: path.join(directory, 'not-created-yet'),
    });
    expect((await empty.list()).items).toEqual([]);

    writeMetadataFile(directory, 'orders', metadataFile('orders', null));
    const scaffolded = new DirectoryCollectionMetadataStore({ directory });
    expect(await scaffolded.get('orders')).toBeUndefined();
  });

  it('reads back exactly what the artifact serializer wrote', async () => {
    const directory = artifactDirectory();
    const resolution = resolveCollection({
      physical: structuredClone(ordersResolverFixture.physical),
      metadata: ordersResolverFixture.metadata,
      naming: ordersResolverFixture.naming,
      context: { resolvePhysicalCollection: () => undefined },
    });
    const files = serializeCollectionArtifact({
      name: 'orders',
      resolution,
      physical: ordersResolverFixture.physical,
      metadata: ordersResolverFixture.metadata,
    });
    writeMetadataFile(directory, 'orders', files.metadata);

    const store = new DirectoryCollectionMetadataStore({ directory });
    expect((await store.get('orders'))?.document).toEqual(
      JSON.parse(JSON.stringify(ordersResolverFixture.metadata)),
    );
  });

  it.each([
    ['invalid JSON', '{ not json', /not valid JSON/],
    ['an array', '[]\n', /must hold an object/],
    [
      'another format version',
      metadataFile('orders', ordersDocument).replace(
        '"formatVersion": 1',
        '"formatVersion": 2',
      ),
      /formatVersion 2/,
    ],
    [
      'a name that differs from its directory',
      metadataFile('other', ordersDocument),
      /names Collection "other"/,
    ],
    [
      'a document for another Collection',
      metadataFile('orders', { ...ordersDocument, name: 'other' }),
      /document for Collection "other"/,
    ],
  ])(
    'rejects a file holding %s and names the file',
    async (_case, content, message) => {
      const directory = artifactDirectory();
      writeMetadataFile(directory, 'orders', content);
      const store = new DirectoryCollectionMetadataStore({ directory });
      const failure = store.get('orders');
      await expect(failure).rejects.toBeInstanceOf(
        CollectionMetadataStoreOptionsError,
      );
      await expect(failure).rejects.toThrow(message);
      await expect(failure).rejects.toThrow(
        path.join(directory, 'orders', 'metadata.json'),
      );
    },
  );

  it('validates the document itself', async () => {
    const directory = artifactDirectory();
    writeMetadataFile(
      directory,
      'orders',
      metadataFile('orders', { version: 1, name: 'orders', fields: 'nope' }),
    );
    await expect(
      new DirectoryCollectionMetadataStore({ directory }).get('orders'),
    ).rejects.toBeInstanceOf(CollectionMetadataValidationError);
  });

  it('is read-only and requires a directory', async () => {
    const directory = artifactDirectory();
    const store = new DirectoryCollectionMetadataStore({ directory });
    expect(store.capabilities).toEqual({
      writable: false,
      optimisticConcurrency: false,
    });
    await expect(store.put(ordersDocument, {} as never)).rejects.toBeInstanceOf(
      CollectionMetadataStoreReadOnlyError,
    );
    await expect(store.delete('orders', {} as never)).rejects.toBeInstanceOf(
      CollectionMetadataStoreReadOnlyError,
    );
    expect(
      () => new DirectoryCollectionMetadataStore({ directory: ' ' }),
    ).toThrow(CollectionMetadataStoreOptionsError);
  });
});
