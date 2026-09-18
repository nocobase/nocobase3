import { createHash } from 'node:crypto';

import type {
  DatabaseConnection,
  DatabaseManager,
  QueryAdapter,
  Row,
} from '@nocobase/db';
import type { NocoBaseQueueScheduleStore } from '@nocobase/queue';
import { CronExpressionParser } from 'cron-parser';

import {
  ScheduleDispatchJob,
  type ScheduleDispatchPayload,
} from './jobs/dispatch.js';
import type { NormalizedScheduleDefinition } from './schedules/define.js';
import type { JsonObject } from './schedules/define.js';
import type { ScheduleOccurrenceStatus } from './occurrences.js';

export interface ScheduleManifestEntry {
  readonly definition: NormalizedScheduleDefinition;
}

export interface ScheduleRecord {
  readonly id: string;
  readonly appName: string;
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

interface ScheduleMaterialization {
  readonly id: string;
  readonly definition: NormalizedScheduleDefinition;
  readonly payload: ScheduleDispatchPayload;
  readonly recalculate: boolean;
  readonly enabled: boolean;
}

export class ScheduleStore {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly appName: string,
    private readonly schedules: NocoBaseQueueScheduleStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async reconcile(
    manifest: readonly ScheduleManifestEntry[],
    finalize: boolean = false,
  ): Promise<void> {
    const plan = await this.database.transaction(async (connection) => {
      await this.lockManifestOwners(connection, manifest, finalize);
      const seen = new Set<string>();
      const materializations: ScheduleMaterialization[] = [];
      for (const entry of manifest) {
        const id = scheduleId(this.appName, entry.definition.key);
        seen.add(id);
        materializations.push(
          await this.upsertDefinition(connection.query, id, entry),
        );
      }
      const deactivate = finalize
        ? await this.findMissing(connection.query, seen)
        : [];
      return { materializations, deactivate };
    });
    for (const materialization of plan.materializations) {
      try {
        await this.materialize(materialization);
        await this.recordSyncResult(materialization.id, 'synced');
      } catch (error) {
        await this.recordSyncResult(
          materialization.id,
          'failed',
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    }
    for (const id of plan.deactivate) {
      await this.schedules.update(id, { status: 'paused' });
      await this.deactivate(id);
    }
  }

  public async list(): Promise<readonly ScheduleRecord[]> {
    const definitions = await this.database
      .query()
      .selectFrom<DefinitionRow>('schedule_definitions')
      .selectAll()
      .where('appName', '=', this.appName)
      .orderBy('title', 'asc')
      .execute<DefinitionRow>();
    const schedules = await this.schedules.list();
    const byId = new Map(schedules.map((schedule) => [schedule.id, schedule]));
    const completedByScheduleId = await this.countCompleted(
      definitions.map((definition) => definition.id),
    );
    return definitions.map((definition) => {
      const schedule = byId.get(definition.id);
      return {
        id: definition.id,
        appName: definition.appName,
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
    const definition = await this.database
      .query()
      .selectFrom<DefinitionRow>('schedule_definitions')
      .select('id')
      .where('id', '=', id)
      .where('appName', '=', this.appName)
      .executeTakeFirst();
    if (!definition) throw new Error('Schedule not found.');
    await this.schedules.update(id, {
      status: enabled ? 'active' : 'paused',
    });
    await this.database
      .query()
      .updateTable<DefinitionRow>('schedule_definitions')
      .set({ enabled, updatedAt: this.now() })
      .where('id', '=', id)
      .execute();
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
  ): Promise<ScheduleMaterialization> {
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
          syncStatus: 'pending',
          syncError: null,
          lastSeenManifest: definition.definitionHash,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return { id, definition, payload, recalculate: true, enabled: true };
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
        syncStatus: 'pending',
        syncError: null,
        lastSeenManifest: definition.definitionHash,
        updatedAt: now,
      })
      .where('id', '=', id)
      .execute();
    return {
      id,
      definition,
      payload,
      recalculate: scheduleChanged || reactivated,
      enabled: Boolean(existing.enabled),
    };
  }

  private async materialize(plan: ScheduleMaterialization): Promise<void> {
    const { id, definition, payload, recalculate, enabled } = plan;
    const current = await this.schedules.get(id);
    await this.schedules.upsert({
      id,
      name: ScheduleDispatchJob.options.name ?? ScheduleDispatchJob.name,
      payload,
      cronExpression: definition.schedule.cron,
      timezone: definition.schedule.timezone,
      ...(definition.schedule.from ? { from: definition.schedule.from } : {}),
      ...(definition.schedule.to ? { to: definition.schedule.to } : {}),
      ...(definition.schedule.limit !== undefined
        ? { limit: definition.schedule.limit }
        : {}),
    });
    await this.schedules.update(id, {
      status: enabled ? 'active' : 'paused',
      nextRunAt:
        recalculate || !current
          ? calculateNextRunAt(definition, this.now())
          : current.nextRunAt,
    });
  }

  private async findMissing(
    query: QueryAdapter,
    seen: ReadonlySet<string>,
  ): Promise<string[]> {
    const rows = await query
      .selectFrom<DefinitionRow>('schedule_definitions')
      .selectAll()
      .where('appName', '=', this.appName)
      .where('sourceType', '=', 'code')
      .where('lifecycleState', '=', 'active')
      .execute<DefinitionRow>();
    return rows.filter((row) => !seen.has(row.id)).map((row) => row.id);
  }

  private async deactivate(id: string): Promise<void> {
    const now = this.now();
    await this.database
      .query()
      .updateTable<DefinitionRow>('schedule_definitions')
      .set({
        lifecycleState: 'inactive',
        inactiveReason: 'definition_removed',
        deactivatedAt: now,
        updatedAt: now,
      })
      .where('id', '=', id)
      .where('appName', '=', this.appName)
      .execute();
  }

  private async recordSyncResult(
    id: string,
    status: 'synced' | 'failed',
    error?: string,
  ): Promise<void> {
    await this.database
      .query()
      .updateTable<DefinitionRow>('schedule_definitions')
      .set({
        syncStatus: status,
        syncError: error ?? null,
        updatedAt: this.now(),
      })
      .where('id', '=', id)
      .where('appName', '=', this.appName)
      .execute();
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

export function scheduleId(appName: string, key: string): string {
  return createHash('sha256').update(`${appName}\0${key}`).digest('hex');
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
