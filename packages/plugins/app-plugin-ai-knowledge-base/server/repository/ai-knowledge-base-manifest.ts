import type { DatabaseConnection } from '@nocobase/db';

import type {
  KnowledgeBaseManifest,
  KnowledgeBaseManifestOperation,
  KnowledgeBaseManifestStatus,
} from '../manifest.js';
import { TableRepository } from './table-repository.js';

export interface KnowledgeBaseManifestEntity {
  id: string | number;
  sourceDisk: string;
  sourceLocation: string;
  knowledgeBaseKey: string;
  knowledgeBaseId: string | number | null;
  operation: KnowledgeBaseManifestOperation;
  status: KnowledgeBaseManifestStatus;
  manifestHash: string;
  manifestSnapshot: KnowledgeBaseManifest;
  attemptCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  errorMessage: string | null;
}

export class KnowledgeBaseManifestRepository extends TableRepository<KnowledgeBaseManifestEntity> {
  public constructor(database: DatabaseConnection) {
    super(database, 'aiKnowledgeBaseManifests', ['manifestSnapshot']);
  }
}
