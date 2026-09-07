import type { DatabaseConnection } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  KnowledgeBaseDocumentRepository,
  KnowledgeBaseManifestFileRepository,
  KnowledgeBaseManifestRepository,
  KnowledgeBaseRepository,
  KnowledgeBaseSegmentRepository,
  KnowledgeBaseSegmentShardRepository,
  VectorDatabaseRepository,
} from '../repository/index.js';

export class KnowledgeBaseRepositoryFactory {
  public constructor(private readonly database: DatabaseConnection) {}

  private knowledgeBaseRepository: KnowledgeBaseRepository | undefined;
  private documentRepository: KnowledgeBaseDocumentRepository | undefined;
  private manifestRepository: KnowledgeBaseManifestRepository | undefined;
  private manifestFileRepository:
    KnowledgeBaseManifestFileRepository | undefined;
  private segmentRepository: KnowledgeBaseSegmentRepository | undefined;
  private segmentShardRepository:
    KnowledgeBaseSegmentShardRepository | undefined;
  private vectorDatabaseRepository: VectorDatabaseRepository | undefined;
  private disposed = false;

  public get knowledgeBases(): KnowledgeBaseRepository {
    this.assertActive();
    return (this.knowledgeBaseRepository ??= new KnowledgeBaseRepository(
      this.database,
    ));
  }

  public get documents(): KnowledgeBaseDocumentRepository {
    this.assertActive();
    return (this.documentRepository ??= new KnowledgeBaseDocumentRepository(
      this.database,
    ));
  }

  public get manifests(): KnowledgeBaseManifestRepository {
    this.assertActive();
    return (this.manifestRepository ??= new KnowledgeBaseManifestRepository(
      this.database,
    ));
  }

  public get manifestFiles(): KnowledgeBaseManifestFileRepository {
    this.assertActive();
    return (this.manifestFileRepository ??=
      new KnowledgeBaseManifestFileRepository(this.database));
  }

  public get segments(): KnowledgeBaseSegmentRepository {
    this.assertActive();
    return (this.segmentRepository ??= new KnowledgeBaseSegmentRepository(
      this.database,
    ));
  }

  public get segmentShards(): KnowledgeBaseSegmentShardRepository {
    this.assertActive();
    return (this.segmentShardRepository ??=
      new KnowledgeBaseSegmentShardRepository(this.database));
  }

  public get vectorDatabases(): VectorDatabaseRepository {
    this.assertActive();
    return (this.vectorDatabaseRepository ??= new VectorDatabaseRepository(
      this.database,
    ));
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.knowledgeBaseRepository = undefined;
    this.documentRepository = undefined;
    this.manifestRepository = undefined;
    this.manifestFileRepository = undefined;
    this.segmentRepository = undefined;
    this.segmentShardRepository = undefined;
    this.vectorDatabaseRepository = undefined;
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
