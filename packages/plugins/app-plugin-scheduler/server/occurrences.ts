import type { DatabaseManager, Row } from '@nocobase/db';

import type { JsonObject } from './schedules/define.js';
import type {
  ScheduleExecutionCompletion,
  ScheduleExecutionContext,
  ScheduleExecutionReporter,
  ScheduleTargetReference,
  ScheduleTargetRegistry,
} from './schedules/registry.js';

export type ScheduleOccurrenceStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timed_out'
  | 'triggered';

interface OccurrenceRow extends Row {
  id: string;
  scheduleId: string;
  definitionHash: string;
  status: ScheduleOccurrenceStatus;
  reason?: string | null;
  targetType: string;
  targetReferenceType?: string | null;
  targetReferenceId?: string | null;
  targetReceipt?: string | JsonObject | null;
  resultSummary?: string | JsonObject | null;
  executionCount: number;
  startedAt: Date;
  acceptedAt?: Date | null;
  lastStartedAt: Date;
  lastObservedAt?: Date | null;
  observationDeadlineAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TERMINAL = new Set<ScheduleOccurrenceStatus>([
  'succeeded',
  'failed',
  'skipped',
  'cancelled',
  'timed_out',
  'triggered',
]);
const MAX_SUMMARY_BYTES = 16_384;
const OBSERVATION_WINDOW_MS = 24 * 60 * 60 * 1_000;

export class ScheduleOccurrenceError extends Error {
  public constructor(
    readonly code:
      | 'OCCURRENCE_NOT_FOUND'
      | 'REFERENCE_MISMATCH'
      | 'INVALID_STATE'
      | 'COMPLETION_CONFLICT'
      | 'SUMMARY_TOO_LARGE',
    message: string,
  ) {
    super(message);
    this.name = 'ScheduleOccurrenceError';
  }
}

export class ScheduleOccurrenceStore implements ScheduleExecutionReporter {
  public constructor(private readonly database: DatabaseManager) {}

  public async start(
    context: ScheduleExecutionContext,
    definitionHash: string,
    targetType: string,
  ): Promise<'start' | 'noop'> {
    const now = new Date();
    const existing = await this.find(context.occurrenceId);
    if (existing) {
      if (existing.status === 'waiting' || TERMINAL.has(existing.status))
        return 'noop';
      const updated = await this.database
        .query()
        .updateTable<OccurrenceRow>('schedule_occurrences')
        .set({
          status: 'running',
          executionCount: existing.executionCount + 1,
          lastStartedAt: now,
          updatedAt: now,
        })
        .where('id', '=', context.occurrenceId)
        .where('status', 'in', ['pending', 'running'])
        .execute();
      if ((updated.updatedCount ?? 0) === 0) {
        const current = await this.required(context.occurrenceId);
        if (current.status === 'waiting' || TERMINAL.has(current.status))
          return 'noop';
      }
      return 'start';
    }
    await this.database
      .query()
      .insertInto<OccurrenceRow>('schedule_occurrences')
      .values({
        id: context.occurrenceId,
        scheduleId: context.scheduleId,
        definitionHash,
        status: 'running',
        reason: null,
        targetType,
        targetReferenceType: null,
        targetReferenceId: null,
        targetReceipt: null,
        resultSummary: null,
        executionCount: 1,
        startedAt: now,
        acceptedAt: null,
        lastStartedAt: now,
        lastObservedAt: null,
        observationDeadlineAt: new Date(now.getTime() + OBSERVATION_WINDOW_MS),
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return 'start';
  }

  public async wait(
    occurrenceId: string,
    reference: ScheduleTargetReference,
    receipt?: JsonObject,
  ): Promise<void> {
    assertReference(reference);
    const serializedReceipt = serializeSummary(receipt);
    const existing = await this.required(occurrenceId);
    if (existing.status === 'waiting') {
      this.assertMatchingReference(existing, reference);
      return;
    }
    if (TERMINAL.has(existing.status)) return;
    if (existing.status !== 'running')
      throw new ScheduleOccurrenceError(
        'INVALID_STATE',
        `Occurrence "${occurrenceId}" cannot wait from ${existing.status}`,
      );
    const now = new Date();
    const result = await this.database
      .query()
      .updateTable<OccurrenceRow>('schedule_occurrences')
      .set({
        status: 'waiting',
        reason: null,
        targetReferenceType: reference.type,
        targetReferenceId: reference.id,
        targetReceipt: serializedReceipt,
        acceptedAt: now,
        observationDeadlineAt: new Date(now.getTime() + OBSERVATION_WINDOW_MS),
        updatedAt: now,
      })
      .where('id', '=', occurrenceId)
      .where('status', '=', 'running')
      .where('targetReferenceType', 'is', null)
      .where('targetReferenceId', 'is', null)
      .execute();
    if ((result.updatedCount ?? 0) === 0) {
      const current = await this.required(occurrenceId);
      if (current.status === 'waiting')
        this.assertMatchingReference(current, reference);
      else if (!TERMINAL.has(current.status))
        throw new ScheduleOccurrenceError(
          'INVALID_STATE',
          `Occurrence "${occurrenceId}" changed while accepting its target`,
        );
    }
  }

  public succeed(occurrenceId: string, result?: JsonObject): Promise<void> {
    return this.finish(occurrenceId, 'succeeded', undefined, result);
  }
  public skip(occurrenceId: string, reason: string): Promise<void> {
    return this.finish(occurrenceId, 'skipped', reason);
  }
  public fail(occurrenceId: string, reason: string): Promise<void> {
    return this.finish(occurrenceId, 'failed', reason);
  }

  public async complete(
    occurrenceId: string,
    reference: ScheduleTargetReference,
    completion: ScheduleExecutionCompletion,
  ): Promise<void> {
    assertReference(reference);
    const existing = await this.required(occurrenceId);
    // A workflow may finish between target.start() returning its run id and
    // wait() persisting that id on the occurrence. The terminal observer is
    // best-effort in that small window; dispatch performs an immediate inspect
    // after wait(), and reconciliation covers any missed notification.
    if (
      existing.status === 'running' &&
      !existing.targetReferenceType &&
      !existing.targetReferenceId
    )
      return;
    this.assertMatchingReference(existing, reference);
    if (TERMINAL.has(existing.status)) {
      if (existing.status === completion.status) return;
      throw new ScheduleOccurrenceError(
        'COMPLETION_CONFLICT',
        `Occurrence "${occurrenceId}" is already ${existing.status}`,
      );
    }
    if (existing.status !== 'waiting')
      throw new ScheduleOccurrenceError(
        'INVALID_STATE',
        `Occurrence "${occurrenceId}" cannot complete from ${existing.status}`,
      );
    await this.finish(
      occurrenceId,
      completion.status,
      completion.reason,
      completion.result,
      completion.finishedAt,
      reference,
    );
  }

  public async reconcile(targets: ScheduleTargetRegistry): Promise<number> {
    const rows = await this.database
      .query()
      .selectFrom<OccurrenceRow>('schedule_occurrences')
      .selectAll()
      .where('status', 'in', ['pending', 'running', 'waiting'])
      // Status ordering keeps pending/running rows ahead of waiting rows on
      // databases (such as Postgres) that sort NULL timestamps last.
      .orderBy('status', 'asc')
      .limit(100)
      .execute<OccurrenceRow>();
    let completed = 0;
    for (const row of rows) {
      const now = new Date();
      if (
        row.observationDeadlineAt &&
        new Date(row.observationDeadlineAt).getTime() <= now.getTime() &&
        (!row.targetReferenceType || !row.targetReferenceId)
      ) {
        const changed = await this.database
          .query()
          .updateTable<OccurrenceRow>('schedule_occurrences')
          .set({
            status: 'timed_out',
            reason: 'observation-timeout',
            finishedAt: now,
            lastObservedAt: now,
            updatedAt: now,
          })
          .where('id', '=', row.id)
          .where('status', 'in', ['pending', 'running'])
          .execute();
        if ((changed.updatedCount ?? 0) > 0) completed += 1;
        continue;
      }
      if (!row.targetReferenceType || !row.targetReferenceId) continue;
      const reference = {
        type: row.targetReferenceType,
        id: row.targetReferenceId,
      };
      let observation: Awaited<ReturnType<ScheduleTargetRegistry['inspect']>>;
      try {
        observation = await targets.inspect(row.targetType, reference);
      } catch (error) {
        console.error('Schedule target observation failed', {
          occurrenceId: row.id,
          targetType: row.targetType,
          reference,
          error,
        });
        observation = { state: 'unknown', reason: 'observer-failed' };
      }
      await this.database
        .query()
        .updateTable<OccurrenceRow>('schedule_occurrences')
        .set({ lastObservedAt: now, updatedAt: now })
        .where('id', '=', row.id)
        .where('status', '=', 'waiting')
        .execute();
      if (observation.state === 'completed') {
        try {
          await this.complete(row.id, reference, observation.completion);
          completed += 1;
        } catch (error) {
          console.error('Schedule occurrence completion failed', {
            occurrenceId: row.id,
            reference,
            error,
          });
        }
      } else if (
        ['pending', 'running', 'unknown'].includes(observation.state) &&
        row.observationDeadlineAt &&
        new Date(row.observationDeadlineAt).getTime() <= now.getTime()
      ) {
        try {
          await this.complete(row.id, reference, {
            status: 'timed_out',
            reason: 'observation-timeout',
            finishedAt: now,
          });
          completed += 1;
        } catch (error) {
          console.error('Schedule occurrence timeout completion failed', {
            occurrenceId: row.id,
            reference,
            error,
          });
        }
      }
    }
    return completed;
  }

  private async finish(
    occurrenceId: string,
    status: 'succeeded' | 'failed' | 'skipped' | 'cancelled' | 'timed_out',
    reason?: string,
    result?: JsonObject,
    finishedAt: Date = new Date(),
    reference?: ScheduleTargetReference,
  ): Promise<void> {
    const resultSummary = serializeSummary(result);
    let update = this.database
      .query()
      .updateTable<OccurrenceRow>('schedule_occurrences')
      .set({
        status,
        reason: reason ?? null,
        resultSummary,
        finishedAt,
        updatedAt: new Date(),
      })
      .where('id', '=', occurrenceId)
      .where('status', 'in', reference ? ['waiting'] : ['running']);
    if (reference)
      update = update
        .where('targetReferenceType', '=', reference.type)
        .where('targetReferenceId', '=', reference.id);
    const changed = await update.execute();
    if ((changed.updatedCount ?? 0) === 0) {
      const current = await this.required(occurrenceId);
      if (current.status === status) return;
      throw new ScheduleOccurrenceError(
        TERMINAL.has(current.status) ? 'COMPLETION_CONFLICT' : 'INVALID_STATE',
        `Occurrence "${occurrenceId}" cannot become ${status} from ${current.status}`,
      );
    }
  }

  private find(occurrenceId: string): Promise<OccurrenceRow | undefined> {
    return this.database
      .query()
      .selectFrom<OccurrenceRow>('schedule_occurrences')
      .selectAll()
      .where('id', '=', occurrenceId)
      .executeTakeFirst<OccurrenceRow>();
  }
  private async required(occurrenceId: string): Promise<OccurrenceRow> {
    const row = await this.find(occurrenceId);
    if (!row)
      throw new ScheduleOccurrenceError(
        'OCCURRENCE_NOT_FOUND',
        `Occurrence "${occurrenceId}" was not found`,
      );
    return row;
  }
  private assertMatchingReference(
    row: OccurrenceRow,
    reference: ScheduleTargetReference,
  ): void {
    if (
      row.targetReferenceType !== reference.type ||
      // Reference ids are serialized as strings at the API boundary, but
      // older rows (and some database drivers) can hydrate numeric ids from
      // the string column. Compare their canonical representation so a
      // callback for run 137 is not rejected when the persisted value is 137.
      String(row.targetReferenceId) !== String(reference.id)
    )
      throw new ScheduleOccurrenceError(
        'REFERENCE_MISMATCH',
        `Target reference does not match occurrence "${row.id}"`,
      );
  }
}

function assertReference(reference: ScheduleTargetReference): void {
  if (!reference.type || !reference.id)
    throw new ScheduleOccurrenceError(
      'REFERENCE_MISMATCH',
      'Target reference type and id are required',
    );
}
function serializeSummary(value?: JsonObject): string | null {
  if (value === undefined) return null;
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SUMMARY_BYTES)
    throw new ScheduleOccurrenceError(
      'SUMMARY_TOO_LARGE',
      `Schedule execution summary exceeds ${MAX_SUMMARY_BYTES} bytes`,
    );
  return serialized;
}
