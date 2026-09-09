import { describe, expect, it, vi } from 'vitest';

import type { VectorDatabaseEntity } from '../server/repository/index.js';
import { createVectorDatabaseRoutes } from '../server/routes/vector-databases.js';
import { VectorDatabaseService } from '../server/services/vector-database-service.js';

const managedDatabase: VectorDatabaseEntity = {
  id: 1,
  key: 'configured',
  name: 'Configured',
  databaseSpec: 'PGVector',
  provider: 'NocobaseDefaultPGVectorProvider',
  connectProps: { host: 'localhost', port: 5432 },
  enabled: true,
  managedBy: 'config',
};

const manualDatabase: VectorDatabaseEntity = {
  ...managedDatabase,
  id: 2,
  key: 'manual',
  name: 'Manual',
  managedBy: null,
};

function createService(
  options: {
    readonly records?: readonly VectorDatabaseEntity[];
    readonly related?: readonly unknown[];
  } = {},
) {
  const records = options.records ?? [managedDatabase, manualDatabase];
  const vectors = {
    find: vi.fn().mockResolvedValue(records),
    count: vi.fn().mockResolvedValue(records.length),
    findById: vi.fn(
      async (id: string | number) =>
        records.find((record) => String(record.id) === String(id)) ?? null,
    ),
    update: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  const bases = {
    find: vi.fn().mockResolvedValue(options.related ?? []),
  };
  const validateConnectParams = vi.fn();
  const service = new VectorDatabaseService(
    {
      features: {
        vectorDatabaseProvider: { validateConnectParams },
      },
    } as never,
    vectors as never,
    bases as never,
  );
  return { bases, service, validateConnectParams, vectors };
}

function expectConfigManagedConflict(error: unknown): boolean {
  expect(error).toMatchObject({
    message:
      'Config-managed vector databases must be changed through application config.',
    status: 409,
    code: 'VECTOR_DATABASE_CONFIG_MANAGED',
  });
  return true;
}

describe('config-managed vector database service protection', () => {
  it('exposes the management marker from list and get', async () => {
    const { service } = createService();

    await expect(
      service.list({ page: 1, pageSize: 20, paginate: true }),
    ).resolves.toMatchObject({
      data: [
        { id: 1, managedBy: 'config', connectProps: {} },
        {
          id: 2,
          managedBy: null,
          connectProps: manualDatabase.connectProps,
        },
      ],
      meta: { count: 2 },
    });
    await expect(service.get({ id: 1 })).resolves.toMatchObject({
      id: 1,
      managedBy: 'config',
      connectProps: {},
    });
  });

  it('rejects update and destroy before mutating config-managed records', async () => {
    const { bases, service, validateConnectParams, vectors } = createService({
      records: [managedDatabase],
    });

    await expect(
      service.update({ id: 1, values: { name: 'Changed' } }),
    ).rejects.toSatisfy(expectConfigManagedConflict);
    await expect(service.destroy({ ids: [1] })).rejects.toSatisfy(
      expectConfigManagedConflict,
    );

    expect(validateConnectParams).not.toHaveBeenCalled();
    expect(bases.find).not.toHaveBeenCalled();
    expect(vectors.update).not.toHaveBeenCalled();
    expect(vectors.destroy).not.toHaveBeenCalled();
  });

  it('keeps update and destroy behavior unchanged for manual records', async () => {
    const { bases, service, validateConnectParams, vectors } = createService({
      records: [manualDatabase],
    });

    await expect(
      service.update({
        id: 2,
        values: { name: 'Changed', managedBy: 'config' },
      }),
    ).resolves.toMatchObject({ id: 2, managedBy: null });
    expect(validateConnectParams).toHaveBeenCalledWith(
      manualDatabase.provider,
      manualDatabase.connectProps,
    );
    expect(vectors.update).toHaveBeenCalledWith(
      { id: 2 },
      expect.objectContaining({ name: 'Changed', managedBy: null }),
    );

    await expect(service.destroy({ ids: [2] })).resolves.toBeUndefined();
    expect(bases.find).toHaveBeenCalledWith({
      filter: { vectorDatabaseKey: manualDatabase.key },
    });
    expect(vectors.destroy).toHaveBeenCalledWith({ id: { $in: [2] } });
  });
});

describe('config-managed vector database routes', () => {
  it('returns the marker from list and get APIs', async () => {
    const { service } = createService();
    const routes = createVectorDatabaseRoutes({ service });

    const listResponse = await routes.request('/aiVectorDatabases:list');
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      data: {
        data: [
          { id: 1, managedBy: 'config' },
          { id: 2, managedBy: null },
        ],
      },
    });

    const getResponse = await routes.request(
      '/aiVectorDatabases:get?filterByTk=1',
    );
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      data: { id: 1, managedBy: 'config' },
    });
  });

  it.each([
    [
      'update',
      '/aiVectorDatabases:update?filterByTk=1',
      { method: 'POST', body: JSON.stringify({ name: 'Changed' }) },
    ],
    ['destroy', '/aiVectorDatabases:destroy?filterByTk=1', { method: 'POST' }],
  ])('returns the stable 409 code from %s', async (_action, path, init) => {
    const { service } = createService({ records: [managedDatabase] });
    const routes = createVectorDatabaseRoutes({ service });

    const response = await routes.request(path, {
      ...init,
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'VECTOR_DATABASE_CONFIG_MANAGED',
      message:
        'Config-managed vector databases must be changed through application config.',
      errors: [
        {
          code: 'VECTOR_DATABASE_CONFIG_MANAGED',
          message:
            'Config-managed vector databases must be changed through application config.',
        },
      ],
    });
  });
});
