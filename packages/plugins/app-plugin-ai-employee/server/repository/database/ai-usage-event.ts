import type { RepositoryOptions } from '@nocobase/ai-employee';
import type { DatabaseConnection } from '@nocobase/db';

import type {
  AIUsageEventEntity,
  AIUsageEventRepository,
  AIUsageEventUpsertValues,
} from '../ai-usage-event.js';
import { BaseCollectionRepository } from './base-collection-repository.js';

const JSON_FIELDS = new Set(['rawUsageMetadata', 'rawResponseMetadata']);

export class DatabaseAIUsageEventRepository
  extends BaseCollectionRepository<AIUsageEventEntity>
  implements AIUsageEventRepository
{
  public constructor(
    private readonly databaseConnection: DatabaseConnection,
    generateId: () => string | number | bigint,
  ) {
    super(databaseConnection, 'aiUsageEvents', generateId, JSON_FIELDS);
  }

  public async upsert(
    values: AIUsageEventUpsertValues,
    options?: RepositoryOptions,
  ): Promise<void> {
    const connection =
      (options?.connection as DatabaseConnection | undefined) ??
      this.databaseConnection;
    const filter = {
      messageId: values.messageId,
      eventType: values.eventType,
    };

    try {
      await connection.transaction(async (savepoint) => {
        const existing = await this.findOne(
          { filter },
          { connection: savepoint },
        );
        if (existing) {
          await this.update({ filter, values }, { connection: savepoint });
          return;
        }
        await this.create({ values }, { connection: savepoint });
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const updated = await this.update({ filter, values }, { connection });
      if (updated === 0) throw error;
    }
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    const code = record.code;
    const number = record.errno ?? record.number ?? record.errorNum;
    if (
      code === '23505' ||
      code === 'ER_DUP_ENTRY' ||
      code === 'SQLITE_CONSTRAINT' ||
      code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
      number === 1 ||
      number === 1062 ||
      number === 2601 ||
      number === 2627
    ) {
      return true;
    }
    current = record.cause ?? record.originalError;
  }
  return false;
}
