import type { JsonObject, ScheduleDefinition } from './define.js';

export interface TargetValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}
export interface ScheduleExecutionContext {
  readonly scheduleId: string;
  readonly occurrenceId: string;
  readonly scheduledFor: Date;
  readonly runNumber: number;
}
export interface ScheduleTargetSummary {
  readonly targetLabel: string;
  readonly description?: string;
  readonly href?: string;
  readonly state?: 'ready' | 'disabled' | 'missing' | 'invalid';
}
export interface ScheduleTargetExecutionResult {
  readonly status: 'triggered' | 'skipped' | 'failed';
  readonly reason?: string;
  readonly receipt?: JsonObject;
}
export interface ScheduleTargetType<TConfig extends JsonObject = JsonObject> {
  readonly type: string;
  readonly title: string;
  validate(config: unknown): TargetValidationResult;
  describe(config: TConfig): Promise<ScheduleTargetSummary>;
  execute(
    config: TConfig,
    context: ScheduleExecutionContext,
  ): Promise<ScheduleTargetExecutionResult>;
}

export class ScheduleTargetRegistry {
  private readonly targets = new Map<string, ScheduleTargetType>();
  public register(target: ScheduleTargetType): void {
    if (this.targets.has(target.type))
      throw new Error(
        `Schedule target type already registered: ${target.type}`,
      );
    this.targets.set(target.type, target);
  }
  public get(type: string): ScheduleTargetType | undefined {
    return this.targets.get(type);
  }
  public validate(
    definition: Pick<ScheduleDefinition, 'target'>,
  ): TargetValidationResult {
    const target = this.get(definition.target.type);
    return target
      ? target.validate(definition.target.config)
      : { valid: false, reason: 'target-not-found' };
  }
  public async describe(
    type: string,
    config: JsonObject,
  ): Promise<ScheduleTargetSummary> {
    const target = this.get(type);
    return target
      ? target.describe(config)
      : { targetLabel: type, state: 'missing' };
  }
  public async execute(
    type: string,
    config: JsonObject,
    context: ScheduleExecutionContext,
  ): Promise<ScheduleTargetExecutionResult> {
    const target = this.get(type);
    if (!target) return { status: 'failed', reason: 'target-not-found' };
    const validation = target.validate(config);
    if (!validation.valid)
      return {
        status: 'failed',
        reason: validation.reason ?? 'invalid-config',
      };
    return target.execute(config, context);
  }
}
