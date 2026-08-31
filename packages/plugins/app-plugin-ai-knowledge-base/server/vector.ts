import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AIManager } from '@nocobase/ai-employee';
import type {
  JsonRecord,
  KnowledgeBaseRecord,
  VectorDatabaseRecord,
  VectorStoreConfigRecord,
} from './types.js';
import { TableRepository } from './repository.js';

const connectSchema: z.ZodType<PgConnectProps> = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  user: z.string().min(1),
  password: z.string().optional(),
  database: z.string().min(1),
  tableName: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$/),
});
export type PgConnectProps = {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  tableName: string;
};
const pools = new Map<string, Pool>();

export class PGVectorProvider {
  validateConnectParams(value: unknown): PgConnectProps {
    return connectSchema.parse(value);
  }
  private pool(value: unknown): Pool {
    const props = this.validateConnectParams(value);
    const hash = createHash('sha256')
      .update(JSON.stringify(props))
      .digest('hex');
    let pool = pools.get(hash);
    if (!pool) {
      pool = new Pool(props);
      pools.set(hash, pool);
    }
    return pool;
  }
  async testConnection(
    value: unknown,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await this.pool(value).connect();
      try {
        await client.query('SELECT 1');
        return { success: true };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  async beforeCreate(
    value: unknown,
    options?: { skipTableExistedCheck?: boolean },
  ): Promise<{ status: number; message?: string }> {
    if (options?.skipTableExistedCheck) return { status: 0 };
    const props = this.validateConnectParams(value);
    const client = await this.pool(props).connect();
    try {
      await client.query(`SELECT 1 FROM ${props.tableName} LIMIT 1`);
      return {
        status: 1,
        message: `Table "${props.tableName}" already exists`,
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '42P01' || code === '3F000') return { status: 0 };
      throw error;
    } finally {
      client.release();
    }
  }
  async createVectorStore(
    embeddings: EmbeddingsInterface,
    value: unknown,
  ): Promise<PGVectorStore> {
    const props = this.validateConnectParams(value);
    return PGVectorStore.initialize(embeddings, {
      pool: this.pool(props),
      tableName: props.tableName,
      columns: {
        idColumnName: 'id',
        vectorColumnName: 'vector',
        contentColumnName: 'content',
        metadataColumnName: 'metadata',
      },
      distanceStrategy: 'cosine',
      scoreNormalization: 'similarity',
    });
  }
}

export const PG_VECTOR_PROVIDER_NAME = 'NocobaseDefaultPGVectorProvider';

export class KnowledgeBaseFeatureService {
  constructor(
    database: import('@nocobase/app-database').DatabaseConnection,
    private readonly ai: AIManager,
    private readonly vectorProvider: PGVectorProvider,
  ) {
    this.bases = new TableRepository(database, 'aiKnowledgeBase');
    this.vectors = new TableRepository(database, 'aiVectorDatabases');
    this.configs = new TableRepository(database, 'aiVectorStoreConfig');
  }
  private readonly bases: TableRepository<KnowledgeBaseRecord>;
  private readonly vectors: TableRepository<VectorDatabaseRecord>;
  private readonly configs: TableRepository<VectorStoreConfigRecord>;
  async getKnowledgeBase(
    keys: string[],
  ): Promise<import('@nocobase/ai-employee').KnowledgeBase[]> {
    const rows = await this.bases.find({ filter: { key: { $in: keys } } });
    return rows.map((row) => this.toKnowledgeBase(row));
  }
  async getKnowledgeBaseGroup(
    keys: string[],
  ): Promise<import('@nocobase/ai-employee').KnowledgeBaseGroup[]> {
    const rows = await this.getKnowledgeBase(keys);
    const groups = new Map<
      string,
      import('@nocobase/ai-employee').KnowledgeBaseGroup
    >();
    for (const row of rows) {
      const config = JSON.stringify({
        vectorStoreProvider: row.vectorStoreProvider,
        vectorDatabaseKey: row.vectorDatabaseKey,
        llmService: row.llmService,
        embeddingModel: row.embeddingModel,
      });
      const group = groups.get(config) ?? {
        vectorStoreConfig: {
          vectorStoreProvider: row.vectorStoreProvider,
          vectorDatabaseKey: row.vectorDatabaseKey,
          llmService: row.llmService,
          embeddingModel: row.embeddingModel,
        },
        knowledgeBaseType: row.knowledgeBaseType,
        knowledgeBaseList: [],
      };
      group.knowledgeBaseList.push(row);
      groups.set(config, group);
    }
    return [...groups.values()];
  }
  async search(
    options: import('@nocobase/ai-employee').SearchOptions,
  ): Promise<import('@nocobase/ai-employee').DocumentSegmentedWithScore[]> {
    const bases = await this.bases.find({
      filter: { key: { $in: options.knowledgeBaseKeys }, enabled: true },
    });
    const output: import('@nocobase/ai-employee').DocumentSegmentedWithScore[] =
      [];
    for (const base of bases) {
      if (base.knowledgeBaseType === 'EXTERNAL') continue;
      const config = await this.configs.findOne({
        key: base.vectorStoreConfigKey,
      });
      if (!config?.vectorDatabaseKey) continue;
      const vectorDb = await this.vectors.findOne({
        key: config.vectorDatabaseKey,
      });
      if (!vectorDb) continue;
      const embeddings = await this.ai.llmProviderManager.createEmbedding({
        llmService: String(config.llmService ?? ''),
        model: String(config.embeddingModel ?? ''),
      });
      const store = await this.vectorProvider.createVectorStore(
        embeddings,
        vectorDb.connectProps,
      );
      const docs = await store.similaritySearchWithScore(
        options.query,
        options.topK ?? 3,
        base.knowledgeBaseType === 'LOCAL'
          ? { knowledgeBaseOuterId: base.knowledgeBaseOuterId }
          : undefined,
      );
      for (const [doc, score] of docs)
        output.push({
          content: doc.pageContent,
          metadata: doc.metadata,
          id: doc.id,
          score,
        });
    }
    return output
      .filter(
        (item) =>
          options.score === undefined || item.score >= Number(options.score),
      )
      .sort((a, b) => b.score - a.score);
  }
  private toKnowledgeBase(
    row: KnowledgeBaseRecord,
  ): import('@nocobase/ai-employee').KnowledgeBase {
    const value = row as JsonRecord;
    return {
      knowledgeBaseType: row.knowledgeBaseType,
      knowledgeBaseOuterId: row.knowledgeBaseOuterId,
      key: row.key,
      name: row.name,
      description: row.description ?? '',
      vectorStoreProvider: row.vectorStoreProvider,
      vectorDatabaseKey: String(
        value.vectorDatabaseKey ?? row.vectorStoreConfigKey ?? '',
      ),
      llmService: String(value.llmService ?? ''),
      embeddingModel: String(value.embeddingModel ?? ''),
      vectorStoreProps: row.vectorStoreProps,
      enabled: row.enabled,
    };
  }
}
