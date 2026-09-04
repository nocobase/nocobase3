import type { DatabaseConnection } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type {
  KnowledgeBaseDocumentRecord,
  KnowledgeBaseRecord,
  SegmentRecord,
  SegmentShardRecord,
  VectorDatabaseRecord,
  VectorStoreConfigRecord,
} from '../internal-types.js';
import { TableRepository } from '../repositories/table-repository.js';

export class KnowledgeBaseRepositoryFactory {
  public constructor(private readonly database: DatabaseConnection) {}

  private knowledgeBaseRepository:
    TableRepository<KnowledgeBaseRecord> | undefined;
  private documentRepository:
    TableRepository<KnowledgeBaseDocumentRecord> | undefined;
  private segmentRepository: TableRepository<SegmentRecord> | undefined;
  private segmentShardRepository:
    TableRepository<SegmentShardRecord> | undefined;
  private vectorDatabaseRepository:
    TableRepository<VectorDatabaseRecord> | undefined;
  private vectorStoreConfigRepository:
    TableRepository<VectorStoreConfigRecord> | undefined;
  private disposed = false;

  public get knowledgeBases(): TableRepository<KnowledgeBaseRecord> {
    this.assertActive();
    return (this.knowledgeBaseRepository ??= new TableRepository(
      this.database,
      'aiKnowledgeBase',
    ));
  }

  public get documents(): TableRepository<KnowledgeBaseDocumentRecord> {
    this.assertActive();
    return (this.documentRepository ??= new TableRepository(
      this.database,
      'aiKnowledgeBaseDocs',
    ));
  }

  public get segments(): TableRepository<SegmentRecord> {
    this.assertActive();
    return (this.segmentRepository ??= new TableRepository(
      this.database,
      'aiKnowledgeBaseDocSegments',
    ));
  }

  public get segmentShards(): TableRepository<SegmentShardRecord> {
    this.assertActive();
    return (this.segmentShardRepository ??= new TableRepository(
      this.database,
      'aiKnowledgeBaseDocSegmentShards',
    ));
  }

  public get vectorDatabases(): TableRepository<VectorDatabaseRecord> {
    this.assertActive();
    return (this.vectorDatabaseRepository ??= new TableRepository(
      this.database,
      'aiVectorDatabases',
    ));
  }

  public get vectorStoreConfigs(): TableRepository<VectorStoreConfigRecord> {
    this.assertActive();
    return (this.vectorStoreConfigRepository ??= new TableRepository(
      this.database,
      'aiVectorStoreConfig',
    ));
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.knowledgeBaseRepository = undefined;
    this.documentRepository = undefined;
    this.segmentRepository = undefined;
    this.segmentShardRepository = undefined;
    this.vectorDatabaseRepository = undefined;
    this.vectorStoreConfigRepository = undefined;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Knowledge base repository factory has been disposed');
    }
  }
}

export const repositoryFactoryToken: ServiceToken<KnowledgeBaseRepositoryFactory> =
  createServiceToken<KnowledgeBaseRepositoryFactory>(
    '@nocobase/app-plugin-ai-knowledge-base/repository-factory',
  );
