import type { AIManager, FileStorageFactory } from '@nocobase/ai-employee';
import type { NocoBaseQueueManager } from '@nocobase/queue';

import { KnowledgeBaseDocumentManager } from '../managers/knowledge-base-document-manager.js';
import { KnowledgeBaseManager } from '../managers/knowledge-base-manager.js';
import { KnowledgeBaseSegmentManager } from '../managers/knowledge-base-segment-manager.js';
import { KnowledgeBaseStorageManager } from '../managers/knowledge-base-storage-manager.js';
import { KnowledgeBaseVectorizationManager } from '../managers/knowledge-base-vectorization-manager.js';
import { QueueVectorizationDispatcher } from '../managers/queue-vectorization-dispatcher.js';
import { VectorStoreManager } from '../managers/vector-store-manager.js';
import type { KnowledgeBaseRepositoryFactory } from './repository-factory.js';

export class KnowledgeBaseManagerFactory {
  public constructor(
    private readonly ai: AIManager,
    private readonly fileStorageFactory: FileStorageFactory,
    private readonly queue: NocoBaseQueueManager,
    private readonly repositories: KnowledgeBaseRepositoryFactory,
    private readonly allowedStorageDisks: readonly string[],
  ) {}

  private knowledgeBaseManager: KnowledgeBaseManager | undefined;
  private documentManager: KnowledgeBaseDocumentManager | undefined;
  private segmentManager: KnowledgeBaseSegmentManager | undefined;
  private storageManager: KnowledgeBaseStorageManager | undefined;
  private vectorizationManager: KnowledgeBaseVectorizationManager | undefined;
  private dispatcherManager: QueueVectorizationDispatcher | undefined;
  private vectorStoreManager: VectorStoreManager | undefined;
  private disposed = false;

  public get knowledgeBases(): KnowledgeBaseManager {
    this.assertActive();
    return (this.knowledgeBaseManager ??= new KnowledgeBaseManager(
      this.repositories.knowledgeBases,
      this.repositories.documents,
      this.repositories.vectorStoreConfigs,
      this.allowedStorageDisks,
    ));
  }

  public get documents(): KnowledgeBaseDocumentManager {
    this.assertActive();
    return (this.documentManager ??= new KnowledgeBaseDocumentManager(
      this.repositories.knowledgeBases,
      this.repositories.documents,
      this.repositories.segments,
      this.repositories.segmentShards,
      this.knowledgeBases,
      this.storage,
      this.dispatcher,
    ));
  }

  public get segments(): KnowledgeBaseSegmentManager {
    this.assertActive();
    return (this.segmentManager ??= new KnowledgeBaseSegmentManager(
      this.repositories.segments,
      this.repositories.segmentShards,
      this.knowledgeBases,
      this.storage,
      this.documents,
    ));
  }

  public get storage(): KnowledgeBaseStorageManager {
    this.assertActive();
    return (this.storageManager ??= new KnowledgeBaseStorageManager(
      this.fileStorageFactory,
      this.repositories.documents,
      this.repositories.segmentShards,
      this.allowedStorageDisks,
    ));
  }

  public get vectorization(): KnowledgeBaseVectorizationManager {
    this.assertActive();
    return (this.vectorizationManager ??= new KnowledgeBaseVectorizationManager(
      this.ai,
      this.repositories.documents,
      this.repositories.segments,
      this.knowledgeBases,
      this.documents,
      this.segments,
      this.storage,
    ));
  }

  public get dispatcher(): QueueVectorizationDispatcher {
    this.assertActive();
    return (this.dispatcherManager ??= new QueueVectorizationDispatcher(
      this.queue,
    ));
  }

  public get vectorStores(): VectorStoreManager {
    this.assertActive();
    return (this.vectorStoreManager ??= new VectorStoreManager(
      this.ai,
      this.repositories.vectorStoreConfigs,
      this.repositories.vectorDatabases,
    ));
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.vectorStoreManager?.clear();
    this.knowledgeBaseManager = undefined;
    this.documentManager = undefined;
    this.segmentManager = undefined;
    this.storageManager = undefined;
    this.vectorizationManager = undefined;
    this.dispatcherManager = undefined;
    this.vectorStoreManager = undefined;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Knowledge base manager factory has been disposed');
    }
  }
}
