import type {
  VectorDatabaseFeature,
  VectorDatabaseInfo,
} from '@nocobase/ai-employee';

import type { VectorDatabaseRecord } from '../internal-types.js';
import type { TableRepository } from '../repositories/table-repository.js';

export class VectorDatabaseFeatureImpl implements VectorDatabaseFeature {
  public constructor(
    private readonly vectorDatabases: TableRepository<VectorDatabaseRecord>,
  ) {}

  public async getVectorDatabaseInfo(id: string): Promise<VectorDatabaseInfo> {
    const record = await this.vectorDatabases.findById(id);
    if (!record) throw new Error(`Vector database "${id}" not found`);
    return this.toInfo(record);
  }

  public async listVectorDatabasesInfo(): Promise<VectorDatabaseInfo[]> {
    return (await this.vectorDatabases.find()).map((record) =>
      this.toInfo(record),
    );
  }

  private toInfo(record: VectorDatabaseRecord): VectorDatabaseInfo {
    return {
      id: String(record.id),
      name: record.name,
      databaseSpec: record.databaseSpec,
      provider: record.provider,
      connectProps: record.connectProps,
      enabled: record.enabled,
    };
  }
}
