import { describe, expect, it, vi } from 'vitest';
import {
  CollectionMetadataConflictError,
  CollectionMetadataPatchError,
  CollectionMetadataService,
  InMemoryCollectionMetadataDocumentStore,
  type CollectionMetadataDocument,
  type CollectionMetadataDocumentValidator,
  type CollectionMetadataInvalidation,
  type CollectionMetadataInvalidator,
} from '../../../src/index.js';

describe('CollectionMetadataService', () => {
  it('creates, patches, clears, and removes empty documents with Store CAS', async () => {
    const fixture = createService();

    const created = await fixture.service.updateCollection('orders', {
      title: 'Orders',
      description: 'Purchase orders',
    });
    expect(created).toEqual({
      document: {
        version: 1,
        name: 'orders',
        title: 'Orders',
        description: 'Purchase orders',
      },
      revision: 1,
    });

    const updated = await fixture.service.updateCollection(
      'orders',
      { title: undefined, description: null },
      { expectedRevision: created!.revision },
    );
    expect(updated?.document).toEqual({
      version: 1,
      name: 'orders',
      title: 'Orders',
    });

    const removed = await fixture.service.updateCollection('orders', {
      title: null,
    });
    expect(removed).toBeUndefined();
    await expect(fixture.store.get('orders')).resolves.toBeUndefined();
    expect(fixture.validator.validate).toHaveBeenCalledTimes(3);
    expect(fixture.invalidator.invalidate).toHaveBeenCalledTimes(3);
  });

  it('treats empty naming as clearing the override and invalidates the Naming Index', async () => {
    const fixture = createService();
    await fixture.store.put(
      {
        version: 1,
        name: 'orders',
        naming: { tablePrefix: 'app_' },
        title: 'Orders',
      },
      { expectedRevision: null },
    );

    const updated = await fixture.service.updateCollection('orders', {
      naming: {},
    });

    expect(updated?.document).toEqual({
      version: 1,
      name: 'orders',
      title: 'Orders',
    });
    expect(fixture.invalidator.invalidate).toHaveBeenCalledWith({
      collections: ['orders'],
      namingIndex: true,
    });
  });

  it('uses the read revision even when the caller does not provide one', async () => {
    const fixture = createService();
    await fixture.store.put(
      { version: 1, name: 'orders', title: 'Orders' },
      { expectedRevision: null },
    );
    fixture.validator.validate.mockImplementationOnce(async () => {
      await fixture.store.put(
        { version: 1, name: 'orders', title: 'Concurrent' },
        { expectedRevision: 1 },
      );
    });

    await expect(
      fixture.service.updateCollection('orders', { title: 'Mine' }),
    ).rejects.toBeInstanceOf(CollectionMetadataConflictError);
    await expect(fixture.store.get('orders')).resolves.toMatchObject({
      document: { title: 'Concurrent' },
      revision: 2,
    });
    expect(fixture.invalidator.invalidate).not.toHaveBeenCalled();
  });

  it('checks an explicit expected revision before validation or writing', async () => {
    const fixture = createService();
    await fixture.store.put(
      { version: 1, name: 'orders', title: 'Orders' },
      { expectedRevision: null },
    );

    await expect(
      fixture.service.updateCollection(
        'orders',
        { title: 'Changed' },
        { expectedRevision: null },
      ),
    ).rejects.toMatchObject({
      code: 'METADATA_CONFLICT',
      expectedRevision: null,
      actualRevision: 1,
    });
    expect(fixture.validator.validate).not.toHaveBeenCalled();
  });

  it('validates Field metadata, supports special keys, and avoids no-op writes', async () => {
    const fixture = createService();

    const created = await fixture.service.updateField('orders', '__proto__', {
      title: 'Prototype field',
    });
    expect(Object.hasOwn(created?.document.fields ?? {}, '__proto__')).toBe(
      true,
    );
    expect(created?.document.fields?.__proto__).toEqual({
      title: 'Prototype field',
    });

    const unchanged = await fixture.service.updateField(
      'orders',
      '__proto__',
      {},
    );
    expect(unchanged?.revision).toBe(created?.revision);
    expect(fixture.validator.validate).toHaveBeenCalledTimes(1);
    expect(fixture.invalidator.invalidate).toHaveBeenCalledTimes(1);

    const removed = await fixture.service.updateField('orders', '__proto__', {
      title: null,
    });
    expect(removed).toBeUndefined();
  });

  it('invalidates old and new relation dependencies after successful validation', async () => {
    const fixture = createService();
    const first = await fixture.service.setRelation('orders', 'customer', {
      type: 'belongsTo',
      target: 'customers',
      through: 'customerOrders',
      foreignKey: 'customerId',
    });
    fixture.invalidator.invalidate.mockClear();

    const second = await fixture.service.setRelation(
      'orders',
      'customer',
      {
        type: 'belongsTo',
        target: 'accounts',
        through: 'accountOrders',
        foreignKey: 'accountId',
      },
      { expectedRevision: first.revision },
    );

    expect(second.document.relations?.customer.target).toBe('accounts');
    expect(fixture.invalidator.invalidate).toHaveBeenCalledWith({
      collections: [
        'orders',
        'customers',
        'customerOrders',
        'accounts',
        'accountOrders',
      ],
      namingIndex: false,
    });

    fixture.invalidator.invalidate.mockClear();
    await fixture.service.removeRelation('orders', 'customer');
    expect(fixture.invalidator.invalidate).toHaveBeenCalledWith({
      collections: ['orders', 'accounts', 'accountOrders'],
      namingIndex: false,
    });
  });

  it('does not write or invalidate when document validation fails', async () => {
    const fixture = createService();
    fixture.validator.validate.mockRejectedValueOnce(new Error('Schema drift'));

    await expect(
      fixture.service.updateField('orders', 'missing', { title: 'Missing' }),
    ).rejects.toThrow('Schema drift');
    await expect(fixture.store.get('orders')).resolves.toBeUndefined();
    expect(fixture.invalidator.invalidate).not.toHaveBeenCalled();
  });

  it('falls back to full invalidation and reports post-commit failures', async () => {
    const fixture = createService();
    const failure = new Error('Targeted invalidation failed');
    fixture.invalidator.invalidate.mockImplementationOnce(() => {
      throw failure;
    });

    const stored = await fixture.service.updateCollection('orders', {
      title: 'Orders',
    });

    expect(stored).toBeDefined();
    expect(fixture.invalidator.invalidateAll).toHaveBeenCalledOnce();
    expect(fixture.onInvalidationError).toHaveBeenCalledWith(failure);
    await expect(fixture.store.get('orders')).resolves.toBeDefined();
  });

  it('rejects unknown or invalid patch properties before reading the Store', async () => {
    const fixture = createService();

    await expect(
      fixture.service.updateCollection('orders', { titel: 'Typo' } as never),
    ).rejects.toBeInstanceOf(CollectionMetadataPatchError);
    await expect(
      fixture.service.updateField('orders', 'amount', { title: 42 } as never),
    ).rejects.toMatchObject({ code: 'COLLECTION_METADATA_PATCH_INVALID' });
    expect(fixture.validator.validate).not.toHaveBeenCalled();
  });
});

interface ServiceFixture {
  readonly store: InMemoryCollectionMetadataDocumentStore;
  readonly service: CollectionMetadataService;
  readonly validator: {
    validate: ReturnType<
      typeof vi.fn<CollectionMetadataDocumentValidator['validate']>
    >;
  };
  readonly invalidator: {
    invalidate: ReturnType<
      typeof vi.fn<CollectionMetadataInvalidator['invalidate']>
    >;
    invalidateAll: ReturnType<
      typeof vi.fn<CollectionMetadataInvalidator['invalidateAll']>
    >;
  };
  readonly onInvalidationError: ReturnType<
    typeof vi.fn<(error: unknown) => void>
  >;
}

function createService(): ServiceFixture {
  const store = new InMemoryCollectionMetadataDocumentStore();
  const validator = {
    validate: vi.fn(async (_document: CollectionMetadataDocument) => {}),
  };
  const invalidator = {
    invalidate: vi.fn((_change: CollectionMetadataInvalidation) => {}),
    invalidateAll: vi.fn(() => {}),
  };
  const onInvalidationError = vi.fn((_error: unknown) => {});
  const service = new CollectionMetadataService({
    store,
    validator,
    invalidator,
    onInvalidationError,
  });
  return { store, service, validator, invalidator, onInvalidationError };
}
