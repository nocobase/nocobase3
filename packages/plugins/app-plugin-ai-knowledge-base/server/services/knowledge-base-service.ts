import type { AIManager } from '@nocobase/ai-employee';

import type {
  KnowledgeBaseDocumentRepository,
  KnowledgeBaseEntity,
  KnowledgeBaseRepository,
  VectorStoreConfigRepository,
} from '../repository/index.js';
import type { KnowledgeBaseDocumentManager } from '../managers/knowledge-base-document-manager.js';
import type { KnowledgeBaseManager } from '../managers/knowledge-base-manager.js';
import type { KnowledgeBaseVectorCleanupManager } from '../managers/knowledge-base-vector-cleanup-manager.js';
import type { KnowledgeBaseWarningLogger } from '../internal-types.js';
import type { PageOptions, PageResult } from './pagination.js';

const BUILT_IN_PROVIDER_NAMES = new Set([
  'NocobaseLocalVectorStore',
  'NocobaseReadOnlyVectorStore',
]);

export class KnowledgeBaseService {
  public constructor(
    private readonly ai: AIManager,
    private readonly manager: KnowledgeBaseManager,
    private readonly documentManager: KnowledgeBaseDocumentManager,
    private readonly vectorCleanup: KnowledgeBaseVectorCleanupManager,
    private readonly bases: KnowledgeBaseRepository,
    private readonly vectorStoreConfigs: VectorStoreConfigRepository,
    private readonly documents: KnowledgeBaseDocumentRepository,
    private readonly allowedStorageDisks: readonly string[],
    private readonly warningLogger: KnowledgeBaseWarningLogger,
  ) {}

  public async list(
    options: PageOptions,
  ): Promise<PageResult<Record<string, unknown>>> {
    const rows = await this.bases.find({
      sort: ['-createdAt'],
      ...(options.paginate
        ? {
            limit: options.pageSize,
            offset: (options.page - 1) * options.pageSize,
          }
        : {}),
    });
    const data = await Promise.all(
      rows.map(async (row): Promise<Record<string, unknown>> => {
        const config = row.vectorStoreConfigKey
          ? await this.vectorStoreConfigs.findOne({
              key: row.vectorStoreConfigKey,
            })
          : null;
        return {
          ...row,
          ...(config
            ? {
                vectorDatabaseKey: config.vectorDatabaseKey,
                llmService: config.llmService,
                embeddingModel: config.embeddingModel,
              }
            : {}),
        };
      }),
    );
    return {
      data,
      meta: {
        count: await this.bases.count(),
        page: options.page,
        pageSize: options.pageSize,
      },
    };
  }

  public create(options: {
    readonly values: Record<string, unknown>;
    readonly userId?: string | number;
  }): Promise<KnowledgeBaseEntity> {
    return this.manager.create(options.values);
  }

  public update(options: {
    readonly id: string | number;
    readonly values: Record<string, unknown>;
    readonly userId?: string | number;
  }): Promise<KnowledgeBaseEntity | null> {
    return this.manager.update(options.id, options.values);
  }

  public async destroy(options: {
    readonly ids: readonly (string | number)[];
    readonly userId?: string | number;
  }): Promise<void> {
    const rows = await this.bases.find({
      filter: { id: { $in: options.ids } },
    });
    for (const row of rows) {
      try {
        await this.vectorCleanup.deleteKnowledgeBaseVectors(row);
      } catch (error) {
        this.warningLogger.warn(
          'Failed to delete knowledge base vectors; continuing knowledge base deletion.',
          { knowledgeBaseKey: row.key, error },
        );
      }
      const documents = await this.documents.find({
        filter: { knowledgeBaseKey: row.key },
      });
      await this.documentManager.deleteDocuments(documents);
    }
    await this.bases.destroy({ id: { $in: options.ids } });
  }

  public async hitTest(options: {
    readonly knowledgeBaseKey: string;
    readonly query: string;
    readonly topK?: number;
    readonly score?: number;
  }): Promise<Record<string, unknown>[]> {
    const results = await this.ai.features.knowledgeBase.search({
      knowledgeBaseKeys: [options.knowledgeBaseKey],
      query: options.query,
      topK: options.topK,
      score: options.score === undefined ? undefined : String(options.score),
    });
    const documents = await this.documents.find({
      filter: {
        id: {
          $in: results
            .map((item) => item.metadata.knowledgeBaseDocsId as string | number)
            .filter(Boolean),
        },
      },
    });
    const byId = new Map(documents.map((item) => [String(item.id), item]));
    return results.map((item) => {
      const document = byId.get(String(item.metadata.knowledgeBaseDocsId));
      return {
        id: item.id,
        content: item.content,
        score: item.score,
        title: document?.title,
        filename: document?.filename,
        matchedQuestions: item.metadata.matchedQuestions ?? [],
        metadata: item.metadata,
      };
    });
  }

  public async confirmVectorStoreChanged(options: {
    readonly key: string;
  }): Promise<void> {
    await this.bases.update(
      { key: options.key },
      { confirmVectorStoreChanged: new Date() },
    );
  }

  public async checkVectorStoreChanged(options: {
    readonly key: string;
  }): Promise<Record<string, unknown> | null> {
    const base = await this.bases.findOne({ key: options.key });
    return base
      ? {
          key: options.key,
          changed: false,
          confirmVectorStoreChanged: base.confirmVectorStoreChanged,
        }
      : null;
  }

  public listStorageDisks(): Array<{ value: string; label: string }> {
    return this.allowedStorageDisks.map((disk) => ({
      value: disk,
      label: disk,
    }));
  }

  public listExternalVectorStoreProviders(): readonly string[] {
    return this.ai.features.vectorStoreProvider.providerNames.filter(
      (name) => !BUILT_IN_PROVIDER_NAMES.has(name),
    );
  }
}
