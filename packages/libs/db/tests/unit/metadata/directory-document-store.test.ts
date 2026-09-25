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
  writeFileSync(path.join(directory, `${name}.json`), content);
}

const ordersDocument = {
  version: 1 as const,
  name: 'orders',
  title: 'Orders',
  fields: { amount: { title: 'Amount' } },
};

function metadataFile(document: unknown): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

describe('DirectoryCollectionMetadataStore', () => {
  it('reads one <name>.json metadata document per Collection', async () => {
    const directory = artifactDirectory();
    writeMetadataFile(directory, 'orders', metadataFile(ordersDocument));
    writeMetadataFile(
      directory,
      'customers',
      metadataFile({ version: 1, name: 'customers', title: 'Customers' }),
    );
    // Not metadata documents: underscore and dot entries, other files, and
    // directories without the generated layout.
    writeFileSync(path.join(directory, '_notes.json'), '{}\n');
    mkdirSync(path.join(directory, '.cache'));
    writeFileSync(path.join(directory, 'README.md'), 'ignored\n');
    mkdirSync(path.join(directory, 'drafts'));

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

  it('treats a missing directory as no metadata', async () => {
    const directory = artifactDirectory();
    const empty = new DirectoryCollectionMetadataStore({
      directory: path.join(directory, 'not-created-yet'),
    });
    expect((await empty.list()).items).toEqual([]);
  });

  it('refuses a directory of generated Collection artifacts and says how to move it', async () => {
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
    mkdirSync(path.join(directory, 'orders'));
    writeFileSync(
      path.join(directory, 'orders', 'metadata.json'),
      files.metadata,
    );

    const failure = new DirectoryCollectionMetadataStore({ directory }).get(
      'orders',
    );
    await expect(failure).rejects.toBeInstanceOf(
      CollectionMetadataStoreOptionsError,
    );
    await expect(failure).rejects.toThrow(
      /layout of generated Collection artifacts.*move the "document" of orders\/metadata\.json to orders\.json/,
    );
  });

  it.each([
    [
      'invalid JSON',
      '{ not json',
      CollectionMetadataStoreOptionsError,
      /not valid JSON/,
    ],
    [
      'a document for another Collection',
      metadataFile({ ...ordersDocument, name: 'other' }),
      CollectionMetadataStoreOptionsError,
      /metadata document of Collection "other"/,
    ],
  ])(
    'rejects a file holding %s and names the file',
    async (_case, content, type, message) => {
      const directory = artifactDirectory();
      writeMetadataFile(directory, 'orders', content);
      const store = new DirectoryCollectionMetadataStore({ directory });
      const failure = store.get('orders');
      await expect(failure).rejects.toBeInstanceOf(type);
      await expect(failure).rejects.toThrow(message);
      await expect(failure).rejects.toThrow(
        path.join(directory, 'orders.json'),
      );
    },
  );

  it.each([
    ['an array', []],
    ['an invalid document', { version: 1, name: 'orders', fields: 'nope' }],
  ])('validates %s as a metadata document', async (_case, document) => {
    const directory = artifactDirectory();
    writeMetadataFile(directory, 'orders', metadataFile(document));
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
