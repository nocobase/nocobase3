import type { DatabaseConnection } from '@nocobase/db';

import { TableRepository } from './table-repository.js';

export interface VectorDatabaseEntity {
  id: string | number;
  key: string;
  name: string;
  databaseSpec: string;
  provider: string;
  connectProps: Record<string, unknown>;
  connectPropsHash?: string;
  enabled: boolean;
  managedBy: 'config' | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export class VectorDatabaseRepository extends TableRepository<VectorDatabaseEntity> {
  public constructor(database: DatabaseConnection) {
    super(database, 'aiVectorDatabases', ['connectProps']);
  }
}
