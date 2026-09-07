import type { AIManager } from '@nocobase/ai-employee';
import { nanoid } from 'nanoid';

import { PG_VECTOR_PROVIDER_NAME } from '../extensions/vector-database/pg-vector-provider.js';
import type {
  KnowledgeBaseEntity,
  KnowledgeBaseRepository,
  VectorDatabaseEntity,
  VectorDatabaseRepository,
} from '../repository/index.js';
import { hashVectorDatabaseConnection } from '../vector-database-config.js';
import { page, type PageOptions, type PageResult } from './pagination.js';

export class VectorDatabaseService {
  public constructor(
    private readonly ai: AIManager,
    private readonly vectors: VectorDatabaseRepository,
    private readonly bases: KnowledgeBaseRepository,
  ) {}

  public list(options: PageOptions): Promise<PageResult<VectorDatabaseEntity>> {
    return page({
      repository: this.vectors,
      paging: options,
      transform: redactConfigManagedConnection,
    });
  }

  public async get(options: {
    readonly id: string | number;
  }): Promise<VectorDatabaseEntity | null> {
    const database = await this.vectors.findById(options.id);
    return database ? redactConfigManagedConnection(database) : null;
  }

  public async create(options: {
    readonly values: Record<string, unknown>;
  }): Promise<VectorDatabaseEntity> {
    const provider = String(options.values.provider ?? PG_VECTOR_PROVIDER_NAME);
    const connectProps = options.values.connectProps as Record<string, unknown>;
    const providers = this.ai.features.vectorDatabaseProvider;
    providers.validateConnectParams(provider, connectProps);
    const check = await providers.beforeCreate(provider, connectProps, {
      skipTableExistedCheck: options.values.skipTableExistedCheck === true,
    });
    if (check.status) {
      const error = new Error(check.message ?? 'TABLE_ALREADY_EXISTS');
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    return this.vectors.create({
      ...options.values,
      key: String(options.values.key ?? nanoid(32)),
      provider,
      databaseSpec: String(options.values.databaseSpec ?? 'PGVector'),
      connectProps,
      connectPropsHash: hashVectorDatabaseConnection(connectProps),
      enabled: options.values.enabled !== false,
      managedBy: null,
    });
  }

  public async update(options: {
    readonly id: string | number;
    readonly values: Record<string, unknown>;
  }): Promise<VectorDatabaseEntity | null> {
    const existing = await this.vectors.findById(options.id);
    if (!existing) return null;
    assertVectorDatabaseMutable(existing);
    const provider = String(options.values.provider ?? existing.provider);
    const connectProps = (options.values.connectProps ??
      existing.connectProps) as Record<string, unknown>;
    this.ai.features.vectorDatabaseProvider.validateConnectParams(
      provider,
      connectProps,
    );
    await this.vectors.update(
      { id: options.id },
      {
        ...options.values,
        provider,
        connectProps,
        connectPropsHash: hashVectorDatabaseConnection(connectProps),
        managedBy: existing.managedBy ?? null,
      },
    );
    return this.vectors.findById(options.id);
  }

  public async destroy(options: {
    readonly ids: readonly (string | number)[];
  }): Promise<void> {
    const databases: VectorDatabaseEntity[] = [];
    for (const id of options.ids) {
      const database = await this.vectors.findById(id);
      if (database) databases.push(database);
    }
    for (const database of databases) assertVectorDatabaseMutable(database);
    for (const database of databases) {
      const related = await this.bases.find({
        filter: { vectorDatabaseKey: database.key },
      });
      if (related.length) {
        const error = new Error('Vector database is used by a knowledge base');
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
    }
    await this.vectors.destroy({ id: { $in: options.ids } });
  }

  public listProviders(): Array<{ name: string; spec: string }> {
    return this.ai.features.vectorDatabaseProvider
      .listProviders()
      .map(({ name, spec }) => ({ name, spec }));
  }

  public async findEnabled(): Promise<VectorDatabaseEntity[]> {
    const databases = await this.vectors.find({
      filter: { enabled: true },
      sort: ['name'],
    });
    return databases.map(redactConfigManagedConnection);
  }

  public testConnection(options: {
    readonly provider: string;
    readonly connectProps: unknown;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      return this.ai.features.vectorDatabaseProvider.testConnection(
        options.provider,
        options.connectProps,
      );
    } catch (error) {
      return Promise.resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public async findRelatedKnowledgeBases(options: {
    readonly vectorDatabaseKey?: string;
  }): Promise<KnowledgeBaseEntity[]> {
    if (!options.vectorDatabaseKey) return [];
    return this.bases.find({
      filter: { vectorDatabaseKey: options.vectorDatabaseKey },
    });
  }
}

function redactConfigManagedConnection(
  database: VectorDatabaseEntity,
): VectorDatabaseEntity {
  return database.managedBy === 'config'
    ? { ...database, connectProps: {} }
    : database;
}

class ConfigManagedVectorDatabaseError extends Error {
  public readonly status = 409;
  public readonly code = 'VECTOR_DATABASE_CONFIG_MANAGED';

  public constructor() {
    super(
      'Config-managed vector databases must be changed through application config.',
    );
    this.name = 'ConfigManagedVectorDatabaseError';
  }
}

function assertVectorDatabaseMutable(database: VectorDatabaseEntity): void {
  if (database.managedBy === 'config') {
    throw new ConfigManagedVectorDatabaseError();
  }
}
