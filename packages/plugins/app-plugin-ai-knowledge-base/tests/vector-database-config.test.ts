import type { AIKnowledgeBaseVectorDatabaseConfig } from '@nocobase/app-plugin-ai-employee/server/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  hashVectorDatabaseConnection,
  normalizeVectorDatabaseConfig,
  VectorDatabaseConfigSynchronizer,
} from '../server/vector-database-config.js';
import type {
  KnowledgeBaseEntity,
  VectorDatabaseEntity,
} from '../server/repository/index.js';

const connection = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'secret',
  database: 'nocobase',
  tableName: 'documents',
};

function configured(
  name: string,
  overrides: Partial<AIKnowledgeBaseVectorDatabaseConfig> = {},
): AIKnowledgeBaseVectorDatabaseConfig {
  return {
    name,
    connection,
    ...overrides,
  };
}

function entity(
  values: Partial<VectorDatabaseEntity> &
    Pick<VectorDatabaseEntity, 'id' | 'name'>,
): VectorDatabaseEntity {
  return {
    key: values.name,
    databaseSpec: 'PGVector',
    provider: 'NocobaseDefaultPGVectorProvider',
    connectProps: connection,
    enabled: true,
    managedBy: 'config',
    ...values,
  };
}

function createSynchronizer(
  options: {
    readonly existing?: VectorDatabaseEntity[];
    readonly related?: KnowledgeBaseEntity[];
  } = {},
) {
  const existing = options.existing ?? [];
  const vectors = {
    find: vi.fn().mockResolvedValue(existing),
    create: vi
      .fn()
      .mockImplementation(async (values: Partial<VectorDatabaseEntity>) =>
        entity({
          id: existing.length + 1,
          name: String(values.name),
          ...values,
        }),
      ),
    update: vi.fn().mockResolvedValue(1),
    destroy: vi.fn().mockResolvedValue(1),
  };
  const bases = {
    find: vi.fn().mockResolvedValue(options.related ?? []),
  };
  const validateConnectParams = vi.fn();
  const warnings = { warn: vi.fn() };
  const onChanged = vi.fn();
  const synchronizer = new VectorDatabaseConfigSynchronizer(
    {
      features: {
        vectorDatabaseProvider: { validateConnectParams },
      },
    } as never,
    vectors as never,
    bases as never,
    warnings,
    onChanged,
  );
  return {
    bases,
    onChanged,
    synchronizer,
    validateConnectParams,
    vectors,
    warnings,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('vector database config normalization', () => {
  it('expands environment references recursively without mutating input', () => {
    vi.stubEnv('VECTOR_HOST', 'db.internal');
    vi.stubEnv('VECTOR_PASSWORD', 'expanded-secret');
    const input = configured('primary', {
      connection: {
        ...connection,
        host: '${VECTOR_HOST}',
        password: '${VECTOR_PASSWORD}',
      },
    });

    expect(normalizeVectorDatabaseConfig([input])).toEqual([
      {
        name: 'primary',
        key: 'primary',
        provider: 'NocobaseDefaultPGVectorProvider',
        databaseSpec: 'PGVector',
        connectProps: {
          ...connection,
          host: 'db.internal',
          password: 'expanded-secret',
        },
        enabled: true,
      },
    ]);
    expect(input.connection.host).toBe('${VECTOR_HOST}');
    expect(input.connection.password).toBe('${VECTOR_PASSWORD}');
  });
});

describe('VectorDatabaseConfigSynchronizer', () => {
  it('creates new config-owned rows and updates existing config-owned rows', async () => {
    const current = entity({
      id: 7,
      name: 'existing',
      key: 'existing',
      connectProps: { ...connection, host: 'old-host' },
    });
    const { synchronizer, validateConnectParams, vectors } = createSynchronizer(
      { existing: [current] },
    );
    const updatedConnection = { ...connection, host: 'new-host' };

    await expect(
      synchronizer.synchronize([
        configured('existing', {
          connection: updatedConnection,
          enabled: false,
        }),
        configured('created'),
      ]),
    ).resolves.toEqual({
      configured: 2,
      created: 1,
      updated: 1,
      deleted: 0,
      retained: 0,
      conflicted: 0,
    });

    expect(validateConnectParams).toHaveBeenNthCalledWith(
      1,
      'NocobaseDefaultPGVectorProvider',
      updatedConnection,
    );
    expect(vectors.update).toHaveBeenCalledWith(
      { id: 7 },
      expect.objectContaining({
        key: 'existing',
        name: 'existing',
        connectProps: updatedConnection,
        connectPropsHash: hashVectorDatabaseConnection(updatedConnection),
        enabled: false,
        managedBy: 'config',
      }),
    );
    expect(vectors.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'created',
        name: 'created',
        connectPropsHash: hashVectorDatabaseConnection(connection),
        managedBy: 'config',
      }),
      { key: 'created' },
    );
  });
  it('does not rewrite or invalidate caches for unchanged config-owned rows', async () => {
    const current = entity({
      id: 7,
      name: 'existing',
      key: 'existing',
      connectPropsHash: hashVectorDatabaseConnection(connection),
    });
    const { onChanged, synchronizer, vectors } = createSynchronizer({
      existing: [current],
    });

    await expect(
      synchronizer.synchronize([configured('existing')]),
    ).resolves.toMatchObject({
      created: 0,
      updated: 0,
      deleted: 0,
    });
    expect(vectors.update).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('deletes an unreferenced config-owned row removed from config', async () => {
    const stale = entity({ id: 3, name: 'stale' });
    const { bases, synchronizer, vectors } = createSynchronizer({
      existing: [stale],
    });

    await expect(synchronizer.synchronize([])).resolves.toMatchObject({
      deleted: 1,
      retained: 0,
    });
    expect(bases.find).toHaveBeenCalledWith({
      filter: { vectorDatabaseKey: 'stale' },
    });
    expect(vectors.destroy).toHaveBeenCalledWith({ id: 3 });
  });

  it('retains a referenced stale row and warns with blocking knowledge-base keys', async () => {
    const stale = entity({ id: 3, name: 'stale' });
    const related = [
      { key: 'product-docs' },
      { key: 'support' },
    ] as KnowledgeBaseEntity[];
    const { synchronizer, vectors, warnings } = createSynchronizer({
      existing: [stale],
      related,
    });

    await expect(synchronizer.synchronize([])).resolves.toMatchObject({
      deleted: 0,
      retained: 1,
    });
    expect(vectors.destroy).not.toHaveBeenCalled();
    expect(warnings.warn).toHaveBeenCalledWith(
      'Configured vector database was removed from config but is still referenced.',
      {
        name: 'stale',
        key: 'stale',
        knowledgeBaseKeys: ['product-docs', 'support'],
      },
    );
  });

  it('warns about a manual conflict without mutating either conflicting row', async () => {
    const manual = entity({
      id: 1,
      name: 'primary',
      managedBy: null,
    });
    const configOwnedKeyConflict = entity({
      id: 2,
      name: 'legacy-name',
      key: 'primary',
    });
    const { bases, synchronizer, vectors, warnings } = createSynchronizer({
      existing: [configOwnedKeyConflict, manual],
    });

    await expect(
      synchronizer.synchronize([configured('primary')]),
    ).resolves.toMatchObject({
      created: 0,
      updated: 0,
      deleted: 0,
      retained: 0,
      conflicted: 1,
    });
    expect(vectors.create).not.toHaveBeenCalled();
    expect(vectors.update).not.toHaveBeenCalled();
    expect(vectors.destroy).not.toHaveBeenCalled();
    expect(bases.find).not.toHaveBeenCalled();
    expect(warnings.warn).toHaveBeenCalledWith(
      'Configured vector database conflicts with a manually managed record.',
      { name: 'primary', key: 'primary', vectorDatabaseId: 1 },
    );
  });
});
