import type { DatabaseManager, Row } from '@nocobase/db';
import type { WorkflowServiceContract } from './tokens.js';
import type {
  JsonObject,
  ScheduleExecutionContext,
  ScheduleTargetExecutionResult,
  ScheduleTargetSummary,
  ScheduleTargetType,
  TargetValidationResult,
} from '@nocobase/app-plugin-scheduler/server';

export type WorkflowScheduleTargetConfig = JsonObject & {
  readonly workflowKey: string;
  readonly input?: JsonObject;
};

interface WorkflowRow extends Row {
  key: string;
  title?: string | null;
  enabled: boolean | number;
  current: boolean | number;
}

export class WorkflowScheduleTarget implements ScheduleTargetType<WorkflowScheduleTargetConfig> {
  public readonly type: string = 'workflow';
  public readonly title: string = 'Workflow';

  public constructor(
    private readonly database: DatabaseManager,
    private readonly workflow: WorkflowServiceContract,
  ) {}

  public validate(config: unknown): TargetValidationResult {
    if (!config || typeof config !== 'object')
      return { valid: false, reason: 'invalid-config' };
    const candidate = config as Partial<WorkflowScheduleTargetConfig>;
    if (typeof candidate.workflowKey !== 'string' || !candidate.workflowKey)
      return { valid: false, reason: 'invalid-config' };
    if (
      candidate.input !== undefined &&
      (!candidate.input ||
        typeof candidate.input !== 'object' ||
        Array.isArray(candidate.input))
    )
      return { valid: false, reason: 'invalid-input' };
    return { valid: true };
  }

  public async describe(
    config: WorkflowScheduleTargetConfig,
  ): Promise<ScheduleTargetSummary> {
    const row = await this.find(config.workflowKey);
    if (!row) return { targetLabel: config.workflowKey, state: 'missing' };
    return {
      targetLabel: row.title ?? row.key,
      href: `/settings/workflows/${encodeURIComponent(row.key)}`,
      state: row.enabled ? 'ready' : 'disabled',
    };
  }

  public async execute(
    config: WorkflowScheduleTargetConfig,
    context: ScheduleExecutionContext,
  ): Promise<ScheduleTargetExecutionResult> {
    const eventKey = `schedule:${context.scheduleId}:${context.occurrenceId}`;
    try {
      const existing = await this.database
        .query()
        .selectFrom('workflow_runs')
        .select('id')
        .where('eventKey', '=', eventKey)
        .executeTakeFirst();
      if (existing) return { status: 'triggered', receipt: { eventKey } };
      const receipt = await this.workflow.trigger(
        config.workflowKey,
        config.input ?? {},
        { eventKey },
      );
      if (receipt.status === 'accepted')
        return { status: 'triggered', receipt: { eventKey: receipt.eventKey } };
      return receipt.reason === 'disabled'
        ? { status: 'skipped', reason: 'target-disabled' }
        : { status: 'failed', reason: 'target-not-found' };
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : undefined;
      if (code === 'INVALID_INPUT' || code === 'INPUT_TOO_LARGE')
        return { status: 'failed', reason: 'invalid-input' };
      if (error instanceof Error && error.message.includes('Artifact'))
        return { status: 'failed', reason: 'artifact-unavailable' };
      return { status: 'failed', reason: 'trigger-failed' };
    }
  }

  private find(key: string): Promise<WorkflowRow | undefined> {
    return this.database
      .query()
      .selectFrom<WorkflowRow>('workflows')
      .selectAll()
      .where('key', '=', key)
      .where('current', '=', true)
      .executeTakeFirst<WorkflowRow>();
  }
}
