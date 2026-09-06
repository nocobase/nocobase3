import type { DatabaseConnection } from '@nocobase/db';

import type { SegmentOptions } from '../internal-types.js';
import { TableRepository } from './table-repository.js';

export type KnowledgeBaseType = 'LOCAL' | 'READONLY' | 'EXTERNAL';

export interface KnowledgeBaseEntity {
  id: string | number;
  key: string;
  knowledgeBaseType: KnowledgeBaseType;
  knowledgeBaseOuterId: string;
  name: string;
  description?: string;
  vectorStoreProvider: string;
  disk: string;
  vectorStoreConfigKey?: string;
  vectorStoreProps?: Array<{ name?: string; key: string; value: unknown }>;
  segmentOptions: SegmentOptions;
  documentCount: number;
  characterCount: number;
  aiEmployeeCount: number;
  enabled: boolean;
  confirmVectorStoreChanged?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export class KnowledgeBaseRepository extends TableRepository<KnowledgeBaseEntity> {
  public constructor(database: DatabaseConnection) {
    super(database, 'aiKnowledgeBase', ['vectorStoreProps', 'segmentOptions']);
  }
}
