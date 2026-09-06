import { createHash } from 'node:crypto';

import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import type { VectorDatabaseProvider } from '@nocobase/ai-employee';
import { Pool } from 'pg';
import { z } from 'zod';

export const PG_VECTOR_PROVIDER_NAME = 'NocobaseDefaultPGVectorProvider';

export type PgConnectProps = {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  tableName: string;
};

type PgPoolProps = Omit<PgConnectProps, 'tableName'>;

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

export class PGVectorProvider implements VectorDatabaseProvider<
  PgConnectProps,
  PGVectorStore
> {
  private readonly pools = new Map<string, Pool>();
  private readonly createPool: (props: PgPoolProps) => Pool;
  private disposed = false;

  public constructor(
    createPool: (props: PgPoolProps) => Pool = (props) => new Pool(props),
  ) {
    this.createPool = createPool;
  }

  public validateConnectParams(value: PgConnectProps): void {
    connectSchema.parse(value);
  }

  public async testConnection(
    value: PgConnectProps,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await this.pool(value).connect();
      try {
        const result = await client.query('SELECT 1;');
        const success = result.rows.length > 0;
        return {
          success,
          ...(success ? {} : { error: 'PGVector extension not found' }),
        };
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

  public async beforeCreate(
    value: PgConnectProps,
    options?: { skipTableExistedCheck?: boolean },
  ): Promise<{ status: number; message?: string }> {
    if (options?.skipTableExistedCheck) return { status: 0 };
    const props = this.parse(value);
    const client = await this.pool(props).connect();
    try {
      await client.query(`SELECT 1 FROM ${props.tableName} LIMIT 1;`);
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

  public async createVectorStore(
    embeddings: EmbeddingsInterface,
    value: PgConnectProps,
  ): Promise<PGVectorStore> {
    const props = this.parse(value);
    const vectorStore = new PGVectorStore(embeddings, {
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
    await vectorStore.ensureTableInDatabase();
    if (vectorStore.collectionTableName) {
      await vectorStore.ensureCollectionTableInDatabase();
    }
    return vectorStore;
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const pools = [...this.pools.values()];
    this.pools.clear();
    await Promise.all(pools.map((pool) => pool.end()));
  }

  private parse(value: PgConnectProps): PgConnectProps {
    return connectSchema.parse(value);
  }

  private pool(value: PgConnectProps): Pool {
    if (this.disposed) throw new Error('PGVector provider has been disposed');
    const { tableName: _tableName, ...poolProps } = this.parse(value);
    const hash = createHash('sha256')
      .update(JSON.stringify(poolProps))
      .digest('hex');
    let pool = this.pools.get(hash);
    if (!pool) {
      pool = this.createPool(poolProps);
      this.pools.set(hash, pool);
    }
    return pool;
  }
}
