import type {
  CollectionMetadataStore,
  CollectionMetadataPage,
  CollectionMetadataStoreCapabilities,
  DeleteCollectionMetadataOptions,
  ListCollectionMetadataOptions,
  PutCollectionMetadataOptions,
} from '../document-store.js';
import {
  CollectionMetadataConflictError,
  CollectionMetadataStoreReadOnlyError,
} from '../document-store-errors.js';
import {
  cloneStoredCollectionMetadata,
  paginateCollectionMetadata,
  validateCollectionMetadataStoreName,
  validateDeleteCollectionMetadataOptions,
  validatePutCollectionMetadataOptions,
} from '../document-store-helpers.js';
import type {
  CollectionMetadataDocument,
  StoredCollectionMetadata,
} from '../document.js';
import { validateCollectionMetadataDocument } from '../validation.js';

interface TransactionEntry {
  readonly original?: StoredCollectionMetadata;
  current?: StoredCollectionMetadata;
  dirty: boolean;
}

interface CommittedEntry {
  readonly name: string;
  readonly original?: StoredCollectionMetadata;
  readonly current?: StoredCollectionMetadata;
}

export class TransactionCollectionMetadataStore implements CollectionMetadataStore {
  readonly capabilities: CollectionMetadataStoreCapabilities;

  private readonly entries = new Map<string, TransactionEntry>();
  private committed: CommittedEntry[] = [];
  private revision = 0;

  constructor(private readonly base: CollectionMetadataStore) {
    this.capabilities = base.capabilities;
  }

  async initialize(): Promise<void> {
    await this.base.initialize();
  }

  async get(name: string): Promise<StoredCollectionMetadata | undefined> {
    validateCollectionMetadataStoreName(name);
    const entry = await this.load(name);
    return entry.current
      ? cloneStoredCollectionMetadata(entry.current)
      : undefined;
  }

  async list(
    options: ListCollectionMetadataOptions = {},
  ): Promise<CollectionMetadataPage> {
    const stored = new Map<string, StoredCollectionMetadata>();
    let cursor: string | undefined;
    do {
      const page = await this.base.list({ limit: 1000, cursor });
      for (const summary of page.items) {
        const item = await this.base.get(summary.name);
        if (item) stored.set(summary.name, item);
      }
      cursor = page.nextCursor;
    } while (cursor);
    for (const [name, entry] of this.entries) {
      if (entry.current) stored.set(name, entry.current);
      else stored.delete(name);
    }
    return paginateCollectionMetadata([...stored.values()], options);
  }

  async put(
    input: CollectionMetadataDocument,
    options: PutCollectionMetadataOptions,
  ): Promise<StoredCollectionMetadata> {
    if (!this.capabilities.writable) {
      throw new CollectionMetadataStoreReadOnlyError('put');
    }
    validatePutCollectionMetadataOptions(options);
    const document = validateCollectionMetadataDocument(input);
    const entry = await this.load(document.name);
    const actual = entry.current?.revision ?? null;
    if (actual !== options.expectedRevision) {
      throw new CollectionMetadataConflictError(
        document.name,
        options.expectedRevision,
        actual,
      );
    }
    const stored = {
      document,
      revision: this.nextRevision(),
    } satisfies StoredCollectionMetadata;
    entry.current = stored;
    entry.dirty = true;
    return cloneStoredCollectionMetadata(stored);
  }

  async delete(
    name: string,
    options: DeleteCollectionMetadataOptions,
  ): Promise<void> {
    if (!this.capabilities.writable) {
      throw new CollectionMetadataStoreReadOnlyError('delete');
    }
    validateCollectionMetadataStoreName(name);
    validateDeleteCollectionMetadataOptions(options);
    const entry = await this.load(name);
    const actual = entry.current?.revision ?? null;
    if (actual !== options.expectedRevision) {
      throw new CollectionMetadataConflictError(
        name,
        options.expectedRevision,
        actual,
      );
    }
    entry.current = undefined;
    entry.dirty = true;
  }

  async commit(): Promise<void> {
    if (this.committed.length > 0) {
      throw new Error('Collection Metadata transaction is already committed.');
    }
    try {
      for (const [name, entry] of [...this.entries].sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      )) {
        if (!entry.dirty) continue;
        let current: StoredCollectionMetadata | undefined;
        if (entry.current) {
          current = await this.base.put(entry.current.document, {
            expectedRevision: entry.original?.revision ?? null,
          });
        } else if (entry.original) {
          await this.base.delete(name, {
            expectedRevision: entry.original.revision,
          });
        }
        this.committed.push({
          name,
          original: entry.original,
          current,
        });
      }
    } catch (error) {
      await this.rollbackCommitted();
      throw error;
    }
  }

  async rollbackCommitted(): Promise<void> {
    for (const entry of [...this.committed].reverse()) {
      if (entry.original) {
        await this.base.put(entry.original.document, {
          expectedRevision: entry.current?.revision ?? null,
        });
      } else if (entry.current) {
        await this.base.delete(entry.name, {
          expectedRevision: entry.current.revision,
        });
      }
    }
    this.committed = [];
  }

  private async load(name: string): Promise<TransactionEntry> {
    const existing = this.entries.get(name);
    if (existing) return existing;
    await this.initialize();
    const original = await this.base.get(name);
    const entry: TransactionEntry = {
      original: original ? cloneStoredCollectionMetadata(original) : undefined,
      current: original ? cloneStoredCollectionMetadata(original) : undefined,
      dirty: false,
    };
    this.entries.set(name, entry);
    return entry;
  }

  private nextRevision(): string {
    this.revision += 1;
    return `transaction-${this.revision}`;
  }
}
