import type { DatabaseConnection } from '@nocobase/db';

import { TableRepository } from './table-repository.js';

export interface VectorStoreConfigEntity {
  id: string | number;
  key: string;
  name: string;
  vectorDatabaseKey?: string;
  vectorDatabaseId?: string;
  llmService?: string;
  embeddingModel: string;
  enabled: boolean;
}

export class VectorStoreConfigRepository extends TableRepository<VectorStoreConfigEntity> {
  public constructor(database: DatabaseConnection) {
    super(database, 'aiVectorStoreConfig');
  }
}
