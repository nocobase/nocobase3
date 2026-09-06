import type { DatabaseConnection } from '@nocobase/db';

import { TableRepository } from './table-repository.js';

export interface KnowledgeBaseSegmentEntity {
  id: string | number;
  uid: string;
  knowledgeBaseKey: string;
  knowledgeBaseOuterId?: string;
  knowledgeBaseDocsId: string | number;
  shardId: string | number;
  shardNo: number;
  contentKey: string;
  position: number;
  title?: string;
  preview?: string;
  contentHash: string;
  charLength: number;
  questionCount: number;
  enabled: boolean;
  segmentVersion: number;
  meta: Record<string, unknown>;
  updatedAt?: Date | string;
}

export class KnowledgeBaseSegmentRepository extends TableRepository<KnowledgeBaseSegmentEntity> {
  public constructor(database: DatabaseConnection) {
    super(database, 'aiKnowledgeBaseDocSegments', ['meta']);
  }
}
