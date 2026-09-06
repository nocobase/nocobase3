import type { DatabaseConnection } from '@nocobase/db';

import type { SegmentOptions } from '../internal-types.js';
import { TableRepository } from './table-repository.js';

export interface KnowledgeBaseDocumentEntity {
  id: string | number;
  key: string;
  title?: string;
  filename: string;
  extname: string;
  size: number;
  mimetype: string;
  path: string;
  url?: string;
  preview?: string;
  disk: string;
  meta: Record<string, unknown>;
  knowledgeBaseKey: string;
  indexStatus: string;
  errorMessage?: string | null;
  characterCount: number;
  segmentCount: number;
  segmentVersion?: number;
  segmentRevision: number;
  segmentStatus?: string | null;
  segmentErrorMessage?: string | null;
  segmentUpdatedAt?: Date | string | null;
  segmentOptions: SegmentOptions;
  enabled: boolean;
  createdById?: string | number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export class KnowledgeBaseDocumentRepository extends TableRepository<KnowledgeBaseDocumentEntity> {
  public constructor(database: DatabaseConnection) {
    super(database, 'aiKnowledgeBaseDocs', ['meta', 'segmentOptions']);
  }
}
