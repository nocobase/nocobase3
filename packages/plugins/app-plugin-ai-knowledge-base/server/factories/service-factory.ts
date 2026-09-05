import type { AIManager, FileStorageFactory } from '@nocobase/ai-employee';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { KnowledgeBaseVectorizationExecutor } from '../internal-types.js';
import { KnowledgeBaseDocumentService } from '../services/knowledge-base-document-service.js';
import { KnowledgeBaseSegmentService } from '../services/knowledge-base-segment-service.js';
import { KnowledgeBaseService } from '../services/knowledge-base-service.js';
import { VectorDatabaseService } from '../services/vector-database-service.js';
import { KnowledgeBaseManagerFactory } from './manager-factory.js';
import type { KnowledgeBaseRepositoryFactory } from './repository-factory.js';

export class KnowledgeBaseServiceFactory {
  public constructor(
    private readonly ai: AIManager,
    fileStorageFactory: FileStorageFactory,
    queue: NocoBaseQueueManager,
    private readonly repositories: KnowledgeBaseRepositoryFactory,
    private readonly allowedStorageDisks: readonly string[],
  ) {
    this.managers = new KnowledgeBaseManagerFactory(
      ai,
      fileStorageFactory,
      queue,
      repositories,
      allowedStorageDisks,
    );
  }

  public readonly managers: KnowledgeBaseManagerFactory;
  private knowledgeBaseService: KnowledgeBaseService | undefined;
  private documentService: KnowledgeBaseDocumentService | undefined;
  private segmentService: KnowledgeBaseSegmentService | undefined;
  private vectorDatabaseService: VectorDatabaseService | undefined;
  private vectorizationExecutor: KnowledgeBaseVectorizationExecutor | undefined;
  private disposed = false;

  public get knowledgeBases(): KnowledgeBaseService {
    this.assertActive();
    return (this.knowledgeBaseService ??= new KnowledgeBaseService(
      this.ai,
      this.managers.knowledgeBases,
      this.managers.documents,
      this.repositories.knowledgeBases,
      this.repositories.vectorStoreConfigs,
      this.repositories.documents,
      this.allowedStorageDisks,
    ));
  }

  public get documents(): KnowledgeBaseDocumentService {
    this.assertActive();
    return (this.documentService ??= new KnowledgeBaseDocumentService(
      this.managers.documents,
      this.repositories.documents,
      this.repositories.knowledgeBases,
    ));
  }

  public get segments(): KnowledgeBaseSegmentService {
    this.assertActive();
    return (this.segmentService ??= new KnowledgeBaseSegmentService(
      this.managers.segments,
      this.managers.documents,
      this.repositories.segments,
      this.repositories.documents,
    ));
  }

  public get vectorDatabases(): VectorDatabaseService {
    this.assertActive();
    return (this.vectorDatabaseService ??= new VectorDatabaseService(
      this.ai,
      this.repositories.vectorDatabases,
      this.repositories.knowledgeBases,
      this.repositories.vectorStoreConfigs,
    ));
  }

  public get vectorization(): KnowledgeBaseVectorizationExecutor {
    this.assertActive();
    return (this.vectorizationExecutor ??= {
      vectorize: ({ documentId, relatedQuestions }) =>
        this.managers.vectorization.vectorize(
          documentId,
          relatedQuestions ? [...relatedQuestions] : [],
        ),
      reindexExistingSegments: ({ documentId }) =>
        this.managers.vectorization.reindexExistingSegments(documentId),
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.managers.dispose();
    this.knowledgeBaseService = undefined;
    this.documentService = undefined;
    this.segmentService = undefined;
    this.vectorDatabaseService = undefined;
    this.vectorizationExecutor = undefined;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Knowledge base service factory has been disposed');
    }
  }
}

export const serviceFactoryToken: ServiceToken<KnowledgeBaseServiceFactory> =
  createServiceToken<KnowledgeBaseServiceFactory>(
    '@nocobase/app-plugin-ai-knowledge-base/service-factory',
  );
