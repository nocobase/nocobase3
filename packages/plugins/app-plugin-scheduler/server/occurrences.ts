import type { DatabaseManager, Row } from '@nocobase/db';

import type { JsonObject } from './schedules/define.js';
import type {
  ScheduleExecutionContext,
  ScheduleTargetExecutionResult,
} from './schedules/registry.js';

interface OccurrenceRow extends Row {
  id: string;
  scheduleId: string;
  definitionHash: string;
  scheduledFor: Date;
  runNumber: number;
  status: string;
  reason?: string | null;
  targetType: string;
  targetReference?: string | null;
  targetReceipt?: string | JsonObject | null;
  executionCount: number;
  startedAt: Date;
  lastStartedAt: Date;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ScheduleOccurrenceStore {
  public constructor(private readonly database: DatabaseManager) {}

  public async start(
    context: ScheduleExecutionContext,
    definitionHash: string,
    targetType: string,
  ): Promise<void> {
    const now = new Date();
    const existing = await this.database
      .query()
      .selectFrom<OccurrenceRow>('schedule_occurrences')
      .selectAll()
      .where('id', '=', context.occurrenceId)
      .executeTakeFirst<OccurrenceRow>();
    if (existing) {
      await this.database
        .query()
        .updateTable<OccurrenceRow>('schedule_occurrences')
        .set({
          status: 'running',
          executionCount: existing.executionCount + 1,
          lastStartedAt: now,
          finishedAt: null,
          updatedAt: now,
        })
        .where('id', '=', context.occurrenceId)
        .execute();
      return;
    }
    await this.database
      .query()
      .insertInto<OccurrenceRow>('schedule_occurrences')
      .values({
        id: context.occurrenceId,
        scheduleId: context.scheduleId,
        definitionHash,
        scheduledFor: context.scheduledFor,
        runNumber: context.runNumber,
        status: 'running',
        reason: null,
        targetType,
        targetReference: null,
        targetReceipt: null,
        executionCount: 1,
        startedAt: now,
        lastStartedAt: now,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  public async finish(
    occurrenceId: string,
    result: ScheduleTargetExecutionResult,
  ): Promise<void> {
    const now = new Date();
    await this.database
      .query()
      .updateTable<OccurrenceRow>('schedule_occurrences')
      .set({
        status: result.status,
        reason: result.reason ?? null,
        targetReceipt: result.receipt ? JSON.stringify(result.receipt) : null,
        finishedAt: now,
        updatedAt: now,
      })
      .where('id', '=', occurrenceId)
      .execute();
  }
}
