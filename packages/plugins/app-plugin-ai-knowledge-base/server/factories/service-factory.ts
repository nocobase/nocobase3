import type { AIManager } from '@nocobase/ai-employee';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { KnowledgeBaseVectorizationExecutor } from '../internal-types.js';
import type { KnowledgeBaseWarningLogger } from '../internal-types.js';
import { DefaultKnowledgeBaseManifestService } from '../services/knowledge-base-manifest-service.js';
import { KnowledgeBaseDocumentService } from '../services/knowledge-base-document-service.js';
import { KnowledgeBaseSegmentService } from '../services/knowledge-base-segment-service.js';
import { KnowledgeBaseService } from '../services/knowledge-base-service.js';
import { VectorDatabaseService } from '../services/vector-database-service.js';
import type { KnowledgeBaseManagerFactory } from './manager-factory.js';
import type { KnowledgeBaseRepositoryFactory } from './repository-factory.js';

export class KnowledgeBaseServiceFactory {
  public constructor(
    private readonly ai: AIManager,
    private readonly managers: KnowledgeBaseManagerFactory,
    private readonly drive: NocoBaseDriveManager,
    private readonly repositories: KnowledgeBaseRepositoryFactory,
    private readonly allowedStorageDisks: readonly string[],
    private readonly warningLogger: KnowledgeBaseWarningLogger,
  ) {}
  private manifestService: DefaultKnowledgeBaseManifestService | undefined;
  private knowledgeBaseService: KnowledgeBaseService | undefined;
  private documentService: KnowledgeBaseDocumentService | undefined;
  private segmentService: KnowledgeBaseSegmentService | undefined;
  private vectorDatabaseService: VectorDatabaseService | undefined;
  private vectorizationExecutor: KnowledgeBaseVectorizationExecutor | undefined;
  private disposed = false;

  public get manifests(): DefaultKnowledgeBaseManifestService {
    this.assertActive();
    return (this.manifestService ??= new DefaultKnowledgeBaseManifestService(
      this.ai,
      this.drive,
      this.repositories,
      this.managers,
      this.warningLogger,
    ));
  }

  public get knowledgeBases(): KnowledgeBaseService {
    this.assertActive();
    return (this.knowledgeBaseService ??= new KnowledgeBaseService(
      this.ai,
      this.managers.knowledgeBases,
      this.managers.documents,
      this.managers.vectorCleanup,
      this.repositories.knowledgeBases,
      this.repositories.vectorDatabases,
      this.repositories.documents,
      this.allowedStorageDisks,
      this.warningLogger,
    ));
  }

  public get documents(): KnowledgeBaseDocumentService {
    this.assertActive();
    return (this.documentService ??= new KnowledgeBaseDocumentService(
      this.managers.documents,
      this.repositories.documents,
      this.repositories.knowledgeBases,
      this.managers.vectorCleanup,
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
    this.manifestService = undefined;
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
