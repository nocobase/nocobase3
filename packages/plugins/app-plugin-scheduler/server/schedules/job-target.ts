import type { JsonObject } from './define.js';
import type {
  ScheduleExecutionContext,
  ScheduleTargetExecutionResult,
  ScheduleTargetType,
  TargetValidationResult,
} from './registry.js';

export interface ScheduleJobRegistration<
  TPayload extends JsonObject = JsonObject,
> {
  readonly name: string;
  readonly title: string;
  validate(payload: unknown): TargetValidationResult;
  dispatch(
    payload: TPayload,
    context: ScheduleExecutionContext,
  ): Promise<ScheduleTargetExecutionResult>;
}

export class JobDispatchRegistry {
  private readonly jobs = new Map<string, ScheduleJobRegistration>();
  public register(job: ScheduleJobRegistration): void {
    if (this.jobs.has(job.name))
      throw new Error(`Schedule job already registered: ${job.name}`);
    this.jobs.set(job.name, job);
  }
  public get(name: string): ScheduleJobRegistration | undefined {
    return this.jobs.get(name);
  }
  public async dispatch(
    name: string,
    payload: JsonObject,
    context: ScheduleExecutionContext,
  ): Promise<ScheduleTargetExecutionResult> {
    const job = this.get(name);
    if (!job) return { status: 'failed', reason: 'job-not-found' };
    const validation = job.validate(payload);
    if (!validation.valid)
      return {
        status: 'failed',
        reason: validation.reason ?? 'invalid-payload',
      };
    return job.dispatch(payload, context);
  }
}

export interface JobScheduleTargetConfig extends JsonObject {
  jobName: string;
  payload: JsonObject;
}

export function createJobTarget(
  registry: JobDispatchRegistry,
): ScheduleTargetType<JobScheduleTargetConfig> {
  return {
    type: 'job',
    title: 'Job',
    validate(config: unknown): TargetValidationResult {
      if (
        !config ||
        typeof config !== 'object' ||
        typeof (config as JobScheduleTargetConfig).jobName !== 'string' ||
        !(config as JobScheduleTargetConfig).payload ||
        typeof (config as JobScheduleTargetConfig).payload !== 'object' ||
        Array.isArray((config as JobScheduleTargetConfig).payload)
      )
        return { valid: false, reason: 'invalid-config' };
      return registry.get((config as JobScheduleTargetConfig).jobName)
        ? { valid: true }
        : { valid: false, reason: 'job-not-found' };
    },
    async describe(config: JobScheduleTargetConfig): Promise<{
      targetLabel: string;
      state: 'ready' | 'missing';
    }> {
      const job = registry.get(config.jobName);
      return {
        targetLabel: job?.title ?? config.jobName,
        state: job ? ('ready' as const) : ('missing' as const),
      };
    },
    async execute(
      config: JobScheduleTargetConfig,
      context: ScheduleExecutionContext,
    ): Promise<ScheduleTargetExecutionResult> {
      return registry.dispatch(config.jobName, config.payload, context);
    },
  };
}
