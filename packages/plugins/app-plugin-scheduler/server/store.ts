import { createHash } from 'node:crypto';

import type {
  DatabaseConnection,
  DatabaseManager,
  QueryAdapter,
  Row,
} from '@nocobase/db';
import { CronExpressionParser } from 'cron-parser';

import {
  ScheduleDispatchJob,
  type ScheduleDispatchPayload,
} from './jobs/dispatch.js';
import type { NormalizedScheduleDefinition } from './schedules/define.js';
import type { JsonObject } from './schedules/define.js';
import type { ScheduleOccurrenceStatus } from './occurrences.js';

export interface ScheduleManifestEntry {
  readonly owner: string;
  readonly definition: NormalizedScheduleDefinition;
}

export interface ScheduleRecord {
  readonly id: string;
  readonly appName: string;
  readonly owner: string;
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly targetType: string;
  readonly lifecycleState: 'active' | 'inactive';
  readonly inactiveReason?: string;
  readonly definitionHash: string;
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly scheduleStatus: 'active' | 'paused';
}

export interface ScheduleTargetProjection {
  readonly id: string;
  readonly type: string;
  readonly config: JsonObject;
}

export interface ScheduleOccurrenceRecord {
  readonly id: string;
  readonly scheduleId: string;
  readonly status: ScheduleOccurrenceStatus;
  readonly reason?: string;
  readonly executionCount: number;
  readonly startedAt: string;
  readonly acceptedAt?: string;
  readonly finishedAt?: string;
  readonly targetReceipt?: JsonObject;
  readonly resultSummary?: JsonObject;
  readonly target: {
    readonly type: string;
    readonly reference?: { readonly type: string; readonly id: string };
  };
}

interface DefinitionRow extends Row {
  id: string;
  appName: string;
  owner: string;
  key: string;
  sourceType: string;
  title: string;
  description?: string | null;
  definitionHash: string;
  cron: string;
  timezone: string;
  fromDate?: Date | string | number | null;
  toDate?: Date | string | number | null;
  runLimit?: number | null;
  enabled: boolean | number;
  targetType: string;
  targetConfig: string | Record<string, unknown>;
  lifecycleState: 'active' | 'inactive';
  inactiveReason?: string | null;
  deactivatedAt?: Date | string | null;
  syncStatus: string;
  syncError?: string | null;
  lastSeenManifest?: string | null;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
}

interface QueueScheduleRow extends Row {
  id: string;
  status: 'active' | 'paused';
  name: string;
  payload: string;
  cronExpression?: string | null;
  everyMs?: number | null;
  timezone: string;
  fromDate?: Date | string | number | null;
  toDate?: Date | string | number | null;
  runLimit?: number | null;
  runCount: number;
  nextRunAt?: Date | string | number | null;
  lastRunAt?: Date | string | number | null;
  createdAt: Date | string | number;
}

export class ScheduleStore {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly appName: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async reconcile(
    manifest: readonly ScheduleManifestEntry[],
    finalize: boolean = false,
  ): Promise<void> {
    await this.database.transaction(async (connection): Promise<void> => {
      await this.lockManifestOwners(connection, manifest, finalize);
      const seen = new Set<string>();
      for (const entry of manifest) {
        const id = scheduleId(this.appName, entry.owner, entry.definition.key);
        seen.add(id);
        await this.upsertDefinition(connection.query, id, entry);
      }
      if (finalize) await this.deactivateMissing(connection.query, seen);
    });
  }

  public async list(): Promise<readonly ScheduleRecord[]> {
    const definitions = await this.database
      .query()
      .selectFrom<DefinitionRow>('schedule_definitions')
      .selectAll()
      .where('appName', '=', this.appName)
      .orderBy('title', 'asc')
      .execute<DefinitionRow>();
    const schedules = await this.database
      .query()
      .selectFrom<QueueScheduleRow>('queue_schedules')
      .selectAll()
      .execute<QueueScheduleRow>();
    const byId = new Map(schedules.map((schedule) => [schedule.id, schedule]));
    const completedByScheduleId = await this.countCompleted(
      definitions.map((definition) => definition.id),
    );
    return definitions.map((definition) => {
      const schedule = byId.get(definition.id);
      return {
        id: definition.id,
        appName: definition.appName,
        owner: definition.owner,
        key: definition.key,
        title: definition.title,
        ...(definition.description
          ? { description: definition.description }
          : {}),
        cron: definition.cron,
        timezone: definition.timezone,
        enabled: Boolean(definition.enabled),
        targetType: definition.targetType,
        lifecycleState: definition.lifecycleState,
        ...(definition.inactiveReason
          ? { inactiveReason: definition.inactiveReason }
          : {}),
        definitionHash: definition.definitionHash,
        runCount: Number(schedule?.runCount ?? 0),
        completedCount: completedByScheduleId.get(definition.id) ?? 0,
        ...(schedule?.nextRunAt
          ? { nextRunAt: dateValue(schedule.nextRunAt) }
          : {}),
        ...(schedule?.lastRunAt
          ? { lastRunAt: dateValue(schedule.lastRunAt) }
          : {}),
        scheduleStatus: schedule?.status ?? 'paused',
      };
    });
  }

  public async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.database.transaction(async (connection) => {
      const query = connection.query;
      const definition = await query
        .selectFrom<DefinitionRow>('schedule_definitions')
        .select('id')
        .where('id', '=', id)
        .where('appName', '=', this.appName)
        .executeTakeFirst();
      if (!definition) throw new Error('Schedule not found.');
      await query
        .updateTable<DefinitionRow>('schedule_definitions')
        .set({ enabled, updatedAt: this.now() })
        .where('id', '=', id)
        .execute();
      await query
        .updateTable<QueueScheduleRow>('queue_schedules')
        .set({ status: enabled ? 'active' : 'paused' })
        .where('id', '=', id)
        .execute();
    });
  }

  /**
   * Counts occurrences that reached the `succeeded` terminal state, per schedule.
   * Only successful outcomes count as completed: `failed`, `timed_out`,
   * `cancelled`, `triggered` (result unknown) and `skipped` (never executed) are
   * deliberately excluded. The result is keyed by schedule id for the schedules
   * passed in, so occurrences orphaned from an app's definitions never appear.
   */
  private async countCompleted(
    scheduleIds: readonly string[],
  ): Promise<Map<string, number>> {
    const completed = new Map<string, number>();
    if (scheduleIds.length === 0) return completed;
    const rows = await this.database
      .query()
      .selectFrom('schedule_occurrences')
      .select(({ fn }) => ['scheduleId', fn.countAll().as('completedCount')])
      .where('scheduleId', 'in', [...scheduleIds])
      .where('status', '=', 'succeeded')
      .groupBy('scheduleId')
      .execute<Row>();
    for (const row of rows) {
      completed.set(String(row.scheduleId), Number(row.completedCount ?? 0));
    }
    return completed;
  }

  public async listTargets(): Promise<readonly ScheduleTargetProjection[]> {
    const rows = await this.database
      .query()
      .selectFrom<DefinitionRow>('schedule_definitions')
      .selectAll()
      .where('appName', '=', this.appName)
      .execute<DefinitionRow>();
    return rows.map((row) => ({
      id: row.id,
      type: row.targetType,
      config: jsonObject(row.targetConfig),
    }));
  }

  public async listOccurrences(
    scheduleId: string,
  ): Promise<readonly ScheduleOccurrenceRecord[]> {
    const owned = await this.database
      .query()
      .selectFrom<DefinitionRow>('schedule_definitions')
      .select('id')
      .where('id', '=', scheduleId)
      .where('appName', '=', this.appName)
      .exists();
    if (!owned) return [];
    const rows = await this.database
      .query()
      .selectFrom('schedule_occurrences')
      .selectAll()
      .where('scheduleId', '=', scheduleId)
      .orderBy('startedAt', 'desc')
      .limit(100)
      .execute();
    return rows.map((row) => ({
      id: String(row.id),
      scheduleId: String(row.scheduleId),
      status: row.status as ScheduleOccurrenceStatus,
      ...(typeof row.reason === 'string' ? { reason: row.reason } : {}),
      executionCount: Number(row.executionCount),
      startedAt: dateValue(row.startedAt as Date | string) ?? '',
      ...(row.acceptedAt
        ? { acceptedAt: dateValue(row.acceptedAt as Date | string) }
        : {}),
      ...(row.finishedAt
        ? { finishedAt: dateValue(row.finishedAt as Date | string) }
        : {}),
      ...(row.targetReceipt
        ? {
            targetReceipt: jsonObject(
              row.targetReceipt as string | Record<string, unknown>,
            ),
          }
        : {}),
      ...(row.resultSummary
        ? {
            resultSummary: jsonObject(
              row.resultSummary as string | Record<string, unknown>,
            ),
          }
        : {}),
      target: {
        type: String(row.targetType),
        ...(typeof row.targetReferenceType === 'string' &&
        typeof row.targetReferenceId === 'string'
          ? {
              reference: {
                type: row.targetReferenceType,
                id: row.targetReferenceId,
              },
            }
          : {}),
      },
    }));
  }

  private async upsertDefinition(
    query: QueryAdapter,
    id: string,
    entry: ScheduleManifestEntry,
  ): Promise<void> {
    const existing = await query
      .selectFrom<DefinitionRow>('schedule_definitions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<DefinitionRow>();
    const now = this.now();
    const definition = entry.definition;
    const payload: ScheduleDispatchPayload = {
      schemaVersion: 1,
      scheduleId: id,
      target: definition.target,
      definitionHash: definition.definitionHash,
    };
    if (!existing) {
      await query
        .insertInto<DefinitionRow>('schedule_definitions')
        .values({
          id,
          appName: this.appName,
          owner: entry.owner,
          key: definition.key,
          sourceType: 'code',
          title: definition.title,
          description: definition.description ?? null,
          definitionHash: definition.definitionHash,
          cron: definition.schedule.cron,
          timezone: definition.schedule.timezone,
          fromDate: definition.schedule.from ?? null,
          toDate: definition.schedule.to ?? null,
          runLimit: definition.schedule.limit ?? null,
          enabled: true,
          targetType: definition.target.type,
          targetConfig: JSON.stringify(definition.target.config),
          lifecycleState: 'active',
          inactiveReason: null,
          deactivatedAt: null,
          syncStatus: 'synced',
          syncError: null,
          lastSeenManifest: definition.definitionHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await this.materialize(query, id, definition, payload, true, true);
      return;
    }
    const scheduleChanged =
      existing.cron !== definition.schedule.cron ||
      existing.timezone !== definition.schedule.timezone ||
      dateValue(existing.fromDate) !== dateValue(definition.schedule.from) ||
      dateValue(existing.toDate) !== dateValue(definition.schedule.to) ||
      Number(existing.runLimit ?? 0) !== Number(definition.schedule.limit ?? 0);
    const reactivated = existing.lifecycleState === 'inactive';
    await query
      .updateTable<DefinitionRow>('schedule_definitions')
      .set({
        title: definition.title,
        description: definition.description ?? null,
        definitionHash: definition.definitionHash,
        cron: definition.schedule.cron,
        timezone: definition.schedule.timezone,
        fromDate: definition.schedule.from ?? null,
        toDate: definition.schedule.to ?? null,
        runLimit: definition.schedule.limit ?? null,
        targetType: definition.target.type,
        targetConfig: JSON.stringify(definition.target.config),
        lifecycleState: 'active',
        inactiveReason: null,
        deactivatedAt: null,
        syncStatus: 'synced',
        syncError: null,
        lastSeenManifest: definition.definitionHash,
        updatedAt: now,
      })
      .where('id', '=', id)
      .execute();
    await this.materialize(
      query,
      id,
      definition,
      payload,
      scheduleChanged || reactivated,
      Boolean(existing.enabled),
    );
  }

  private async materialize(
    query: QueryAdapter,
    id: string,
    definition: NormalizedScheduleDefinition,
    payload: ScheduleDispatchPayload,
    recalculate: boolean,
    enabled: boolean,
  ): Promise<void> {
    const current = await query
      .selectFrom<QueueScheduleRow>('queue_schedules')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<QueueScheduleRow>();
    const values = {
      status: enabled ? ('active' as const) : ('paused' as const),
      name: ScheduleDispatchJob.options.name ?? ScheduleDispatchJob.name,
      payload: JSON.stringify(payload),
      cronExpression: definition.schedule.cron,
      everyMs: null,
      timezone: definition.schedule.timezone,
      fromDate: definition.schedule.from ?? null,
      toDate: definition.schedule.to ?? null,
      runLimit: definition.schedule.limit ?? null,
      ...(recalculate || !current
        ? { nextRunAt: calculateNextRunAt(definition, this.now()) }
        : {}),
    };
    if (current) {
      await query
        .updateTable<QueueScheduleRow>('queue_schedules')
        .set(values)
        .where('id', '=', id)
        .execute();
    } else {
      await query
        .insertInto<QueueScheduleRow>('queue_schedules')
        .values({
          id,
          ...values,
          runCount: 0,
          lastRunAt: null,
          createdAt: this.now(),
        })
        .execute();
    }
  }

  private async deactivateMissing(
    query: QueryAdapter,
    seen: ReadonlySet<string>,
  ): Promise<void> {
    const rows = await query
      .selectFrom<DefinitionRow>('schedule_definitions')
      .selectAll()
      .where('appName', '=', this.appName)
      .where('sourceType', '=', 'code')
      .where('lifecycleState', '=', 'active')
      .execute<DefinitionRow>();
    const now = this.now();
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      await query
        .updateTable<DefinitionRow>('schedule_definitions')
        .set({
          lifecycleState: 'inactive',
          inactiveReason: 'definition_removed',
          deactivatedAt: now,
          updatedAt: now,
        })
        .where('id', '=', row.id)
        .execute();
      await query
        .updateTable<QueueScheduleRow>('queue_schedules')
        .set({ status: 'paused' })
        .where('id', '=', row.id)
        .execute();
    }
  }

  private async lockManifestOwners(
    connection: DatabaseConnection,
    _manifest: readonly ScheduleManifestEntry[],
    _finalize: boolean,
  ): Promise<void> {
    interface LockInsert {
      onConflict(columns: readonly string[]): LockInsert;
      ignore(): Promise<unknown>;
    }
    interface LockQuery {
      where(values: Record<string, unknown>): LockQuery;
      forUpdate(): LockQuery;
      select(column: string): Promise<unknown>;
      insert(values: Record<string, unknown>): LockInsert;
    }
    const client = await connection.client<{
      (table: string): LockQuery;
    }>();
    const now = this.now();
    await client('schedule_sync_locks')
      .insert({ app_name: this.appName, created_at: now, updated_at: now })
      .onConflict(['app_name'])
      .ignore();
    await client('schedule_sync_locks')
      .where({ app_name: this.appName })
      .forUpdate()
      .select('app_name');
  }
}

export function scheduleId(
  appName: string,
  owner: string,
  key: string,
): string {
  return createHash('sha256')
    .update(`${appName}\0${owner}\0${key}`)
    .digest('hex');
}

function dateValue(
  value: Date | string | number | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const normalized =
    typeof value === 'string' && /^\d+(?:\.0+)?$/u.test(value)
      ? Number(value)
      : value;
  return new Date(normalized).toISOString();
}

function jsonObject(value: string | Record<string, unknown>): JsonObject {
  return typeof value === 'string'
    ? (JSON.parse(value) as JsonObject)
    : (value as JsonObject);
}

function calculateNextRunAt(
  definition: NormalizedScheduleDefinition,
  now: Date,
): Date | null {
  const currentDate =
    definition.schedule.from && definition.schedule.from > now
      ? new Date(definition.schedule.from.getTime() - 1)
      : new Date(now);
  // Cron expressions describe discrete second/minute boundaries. Do not let
  // the scheduler's polling millisecond leak into the next occurrence (for
  // example, `02:40:00.722Z`).
  currentDate.setMilliseconds(0);
  const next = CronExpressionParser.parse(definition.schedule.cron, {
    currentDate,
    tz: definition.schedule.timezone,
  })
    .next()
    .toDate();
  return definition.schedule.to && next > definition.schedule.to ? null : next;
}
