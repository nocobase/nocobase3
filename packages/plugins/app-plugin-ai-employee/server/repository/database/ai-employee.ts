import type { DatabaseConnection } from '@nocobase/db';
import type {
  AIEmployeeEntity,
  AIEmployeeRepository,
  CollectionQuery,
  RepositoryOptions,
} from '@nocobase/ai-employee';
import { BaseCollectionRepository } from './base-collection-repository.js';

export class DatabaseAIEmployeeRepository
  extends BaseCollectionRepository<AIEmployeeEntity>
  implements AIEmployeeRepository
{
  constructor(
    connection: DatabaseConnection,
    generateId?: () => string | number | bigint,
  ) {
    super(connection, 'aiEmployees', generateId);
  }

  override find(
    query: CollectionQuery<AIEmployeeEntity> = {},
    options?: RepositoryOptions,
  ): Promise<AIEmployeeEntity[]> {
    return super.find(
      {
        ...query,
        sort: query.sort ?? ['sort', 'username'],
      },
      options,
    );
  }
}
