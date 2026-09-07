import { createHash } from 'node:crypto';

import type { AIManager } from '@nocobase/ai-employee';
import { nanoid } from 'nanoid';

import { PG_VECTOR_PROVIDER_NAME } from '../providers/vector-database/pg-vector-provider.js';
import type {
  JsonRecord,
  KnowledgeBaseRecord,
  VectorDatabaseRecord,
  VectorStoreConfigRecord,
} from '../internal-types.js';
import type { TableRepository } from '../repositories/table-repository.js';
import { page, type PageOptions, type PageResult } from './pagination.js';

export class VectorDatabaseService {
  public constructor(
    private readonly ai: AIManager,
    private readonly vectors: TableRepository<VectorDatabaseRecord>,
    private readonly bases: TableRepository<KnowledgeBaseRecord>,
    private readonly vectorStoreConfigs: TableRepository<VectorStoreConfigRecord>,
  ) {}

  public list(options: PageOptions): Promise<PageResult<JsonRecord>> {
    return page({ repository: this.vectors, paging: options });
  }

  public get(options: {
    readonly id: string | number;
  }): Promise<VectorDatabaseRecord | null> {
    return this.vectors.findById(options.id);
  }

  public async create(options: {
    readonly values: JsonRecord;
  }): Promise<VectorDatabaseRecord> {
    const provider = String(options.values.provider ?? PG_VECTOR_PROVIDER_NAME);
    const connectProps = options.values.connectProps as JsonRecord;
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
      connectPropsHash: hashConnectProps(connectProps),
      enabled: options.values.enabled !== false,
    });
  }

  public async update(options: {
    readonly id: string | number;
    readonly values: JsonRecord;
  }): Promise<VectorDatabaseRecord | null> {
    const existing = await this.vectors.findById(options.id);
    if (!existing) return null;
    const provider = String(options.values.provider ?? existing.provider);
    const connectProps = (options.values.connectProps ??
      existing.connectProps) as JsonRecord;
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
        connectPropsHash: hashConnectProps(connectProps),
      },
    );
    return this.vectors.findById(options.id);
  }

  public async destroy(options: {
    readonly ids: readonly (string | number)[];
  }): Promise<void> {
    for (const id of options.ids) {
      const database = await this.vectors.findById(id);
      if (!database) continue;
      const configs = await this.vectorStoreConfigs.find({
        filter: { vectorDatabaseKey: database.key },
      });
      const related = await this.bases.find({
        filter: {
          vectorStoreConfigKey: {
            $in: configs.map((config) => config.key),
          },
        },
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

  public findEnabled(): Promise<VectorDatabaseRecord[]> {
    return this.vectors.find({
      filter: { enabled: true },
      sort: ['name'],
    });
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
  }): Promise<KnowledgeBaseRecord[]> {
    if (!options.vectorDatabaseKey) return [];
    const configs = await this.vectorStoreConfigs.find({
      filter: { vectorDatabaseKey: options.vectorDatabaseKey },
    });
    if (!configs.length) return [];
    return this.bases.find({
      filter: {
        vectorStoreConfigKey: { $in: configs.map((config) => config.key) },
      },
    });
  }
}

function hashConnectProps(connectProps: JsonRecord): string {
  return createHash('sha256')
    .update(JSON.stringify(connectProps))
    .digest('hex');
}
