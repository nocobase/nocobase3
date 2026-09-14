import type { JsonObject } from './define.js';
import type {
  ScheduleExecutionCompletion,
  ScheduleExecutionContext,
  ScheduleTargetStartResult,
  ScheduleTargetObservation,
  ScheduleTargetReference,
  ScheduleTargetType,
  TargetValidationResult,
} from './registry.js';
import type { ScheduleExecutionReporter } from './registry.js';

export interface ScheduleJobRegistration<
  TPayload extends JsonObject = JsonObject,
> {
  readonly name: string;
  readonly title: string;
  validate(payload: unknown): TargetValidationResult;
  dispatch(
    payload: TPayload,
    context: ScheduleExecutionContext,
  ): Promise<ScheduleTargetStartResult>;
}

export class JobDispatchRegistry {
  private readonly jobs = new Map<string, ScheduleJobRegistration>();
  private readonly observers = new Map<
    string,
    (reference: ScheduleTargetReference) => Promise<ScheduleTargetObservation>
  >();
  private reporter?:
    ScheduleExecutionReporter | (() => ScheduleExecutionReporter);
  public setCompletionReporter(
    reporter: ScheduleExecutionReporter | (() => ScheduleExecutionReporter),
  ): void {
    this.reporter = reporter;
  }
  /** Queue workers call this from their terminal lifecycle, including after retries. */
  public reportCompletion(
    occurrenceId: string,
    reference: ScheduleTargetReference,
    completion: ScheduleExecutionCompletion,
  ): Promise<void> {
    if (!this.reporter)
      return Promise.reject(
        new Error('Schedule completion reporter is unavailable'),
      );
    const reporter =
      typeof this.reporter === 'function' ? this.reporter() : this.reporter;
    return reporter.complete(occurrenceId, reference, completion);
  }
  public register(job: ScheduleJobRegistration): void {
    if (this.jobs.has(job.name))
      throw new Error(`Schedule job already registered: ${job.name}`);
    this.jobs.set(job.name, job);
  }
  public get(name: string): ScheduleJobRegistration | undefined {
    return this.jobs.get(name);
  }
  public registerObserver(
    referenceType: string,
    inspect: (
      reference: ScheduleTargetReference,
    ) => Promise<ScheduleTargetObservation>,
  ): void {
    if (this.observers.has(referenceType))
      throw new Error(
        `Schedule Job observer already registered: ${referenceType}`,
      );
    this.observers.set(referenceType, inspect);
  }
  public inspect(
    reference: ScheduleTargetReference,
  ): Promise<ScheduleTargetObservation> {
    const observer = this.observers.get(reference.type);
    return observer
      ? observer(reference)
      : Promise.resolve({ state: 'unknown', reason: 'observer-unavailable' });
  }
  public async dispatch(
    name: string,
    payload: JsonObject,
    context: ScheduleExecutionContext,
  ): Promise<ScheduleTargetStartResult> {
    const job = this.get(name);
    if (!job) return { state: 'failed', reason: 'job-not-found' };
    const validation = job.validate(payload);
    if (!validation.valid)
      return {
        state: 'failed',
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
    async start(
      config: JobScheduleTargetConfig,
      context: ScheduleExecutionContext,
    ): Promise<ScheduleTargetStartResult> {
      return registry.dispatch(config.jobName, config.payload, context);
    },
    inspect: (reference) => registry.inspect(reference),
  };
}
