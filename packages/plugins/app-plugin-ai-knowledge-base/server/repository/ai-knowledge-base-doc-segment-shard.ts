import type { DatabaseConnection } from '@nocobase/db';

import { TableRepository } from './table-repository.js';

export interface KnowledgeBaseSegmentShardEntity {
  id: string | number;
  knowledgeBaseKey: string;
  knowledgeBaseDocsId: string | number;
  shardNo: number;
  segmentVersion: number;
  segmentCount: number;
  contentHash: string;
  filename: string;
  extname: string;
  path: string;
  url?: string;
  size: number;
  mimetype: string;
  disk: string;
  createdById?: string | number;
  meta: Record<string, unknown> & { segments?: unknown };
}

export class KnowledgeBaseSegmentShardRepository extends TableRepository<KnowledgeBaseSegmentShardEntity> {
  public constructor(database: DatabaseConnection) {
    super(database, 'aiKnowledgeBaseDocSegmentShards', ['meta']);
  }
}
