import type { DatabaseConnection } from '@nocobase/app-database';
import type {
  AIEmployeeEntity,
  AIEmployeeRepository,
  CollectionQuery,
  RepositoryOptions,
} from '@nocobase/ai-employee';
import { BaseCollectionRepository } from './base-collection-repository.js';

const JSON_FIELDS = new Set([
  'chatSettings',
  'skillSettings',
  'modelSettings',
  'dataSourceSettings',
  'knowledgeBase',
]);

export class DatabaseAIEmployeeRepository
  extends BaseCollectionRepository<AIEmployeeEntity>
  implements AIEmployeeRepository
{
  constructor(
    connection: DatabaseConnection,
    generateId?: () => string | number | bigint,
  ) {
    super(connection, 'aiEmployees', generateId, JSON_FIELDS);
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
