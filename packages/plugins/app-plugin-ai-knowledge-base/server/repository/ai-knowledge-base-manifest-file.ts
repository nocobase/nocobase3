import type { DatabaseConnection } from '@nocobase/db';

import type { KnowledgeBaseManifestStatus } from '../manifest.js';
import { TableRepository } from './table-repository.js';

export interface KnowledgeBaseManifestFileEntity {
  id: string | number;
  manifestRecordId: string | number;
  sourceDisk: string;
  sourceLocation: string;
  knowledgeBaseKey: string;
  contentHash: string | null;
  documentId: string | number | null;
  documentKey: string | null;
  status: KnowledgeBaseManifestStatus;
  attemptCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  failureReason: string | null;
}

export class KnowledgeBaseManifestFileRepository extends TableRepository<KnowledgeBaseManifestFileEntity> {
  public constructor(database: DatabaseConnection) {
    super(database, 'aiKnowledgeBaseManifestFiles');
  }
}
