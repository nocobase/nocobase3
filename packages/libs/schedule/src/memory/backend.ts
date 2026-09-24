import path from 'node:path';

import { CronJob } from 'cron';

import type { ResolvedMemoryScheduleExecutorConfig } from '../config.js';
import {
  ScheduleHandlerNotRegisteredError,
  type ScheduleBackend,
  type ScheduleExecutionSettings,
  type ScheduleRuleWrite,
  type ScheduleRunner,
  type StoredScheduleRule,
} from '../executor.js';
import type { JobScheduler, ScheduleLogger } from '../types.js';
import {
  defaultLockEnvironment,
  MemoryStateLock,
  type MemoryLockEnvironment,
} from './lock.js';
import {
  memoryStateFileBase,
  MemoryStateFile,
  type MemoryJobState,
} from './state-file.js';
import { firstFiring, nextFiring } from './timing.js';

/** How long a firing whose state could not be written waits before it tries again. */
const PERSIST_RETRY_DELAY = 5_000;

export interface InMemoryScheduleBackendOptions {
  readonly lockEnvironment?: MemoryLockEnvironment;
}

interface QueuedFiring {
  readonly name: string;
  readonly scheduledAt: number;
}

/**
 * Schedules in this process and persists every rule, its next firing and its
 * firing count to one state file per namespace and scope. `cron` fires each
 * planned firing through a one-shot job created from its `Date`; `cron-parser`
 * computes the firing after it.
 */
export class InMemoryScheduleBackend implements ScheduleBackend {
  public readonly settings: ScheduleExecutionSettings;
  private readonly file: MemoryStateFile;
  private readonly lock: MemoryStateLock;
  private state = new Map<string, MemoryJobState>();
  private writes: Promise<unknown> = Promise.resolve();
  private readonly timers = new Map<string, CronJob | NodeJS.Timeout>();
  private readonly queue: QueuedFiring[] = [];
  private readonly running = new Set<Promise<void>>();
  private runner: ScheduleRunner | undefined;
  private abort = new AbortController();

  public constructor(
    private readonly config: ResolvedMemoryScheduleExecutorConfig,
    private readonly logger: ScheduleLogger | undefined,
    options: InMemoryScheduleBackendOptions = {},
  ) {
    this.settings = Object.freeze({ attempts: config.attempts });
    const base = path.join(
      config.persistencePath,
      memoryStateFileBase(config.namespace, config.scope),
    );
    this.file = new MemoryStateFile(
      `${base}.json`,
      config.namespace,
      config.scope,
    );
    this.lock = new MemoryStateLock(
      `${base}.lock`,
      logger,
      options.lockEnvironment ?? defaultLockEnvironment,
    );
  }

  public get statePath(): string {
    return this.file.filePath;
  }

  public async open(): Promise<void> {
    await this.lock.acquire();
    try {
      this.state = await this.file.read();
    } catch (error) {
      await this.lock.release();
      throw error;
    }
  }

  public read(name: string): Promise<StoredScheduleRule | undefined> {
    const job = this.state.get(name);
    return Promise.resolve(job ? toStoredRule(job) : undefined);
  }

  public async write(rule: ScheduleRuleWrite): Promise<Date | undefined> {
    const nextRunAt = firstFiring(rule.options, Date.now(), rule.immediately);
    await this.mutate((draft) => {
      draft.set(rule.name, {
        options: rule.options,
        payload: jsonCopy(rule.payload),
        settings: rule.settings,
        nextRunAt,
        fired: 0,
      });
    });
    // The rule replaces the one before it, and with it any firing of the old
    // rule still waiting for a free slot.
    this.dropQueued(rule.name);
    this.arm(rule.name);
    return nextRunAt === null ? undefined : new Date(nextRunAt);
  }

  public async remove(name: string): Promise<boolean> {
    if (!this.state.has(name)) return false;
    await this.mutate((draft) => {
      draft.delete(name);
    });
    this.disarm(name);
    this.dropQueued(name);
    return true;
  }

  public count(): Promise<number> {
    return Promise.resolve(this.state.size);
  }

  public list(start: number, end: number): Promise<JobScheduler[]> {
    const ordered = [...this.state]
      .sort(([leftName, left], [rightName, right]) => {
        const byNext =
          (left.nextRunAt ?? Number.POSITIVE_INFINITY) -
          (right.nextRunAt ?? Number.POSITIVE_INFINITY);
        if (byNext !== 0 && !Number.isNaN(byNext)) return byNext;
        return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
      })
      .map(([name, job]) => toJobScheduler(name, job));
    const stop = end < 0 ? ordered.length + end + 1 : end + 1;
    return Promise.resolve(ordered.slice(Math.max(start, 0), stop));
  }

  public consume(runner: ScheduleRunner): Promise<void> {
    this.runner = runner;
    this.abort = new AbortController();
    // A firing missed while nothing ran is due now and fires once; the next
    // one is computed from the present when it starts.
    for (const name of this.state.keys()) this.arm(name);
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    this.runner = undefined;
    for (const name of [...this.timers.keys()]) this.disarm(name);
    this.queue.length = 0;
    this.abort.abort(new Error('The schedule executor is shutting down.'));
    await Promise.allSettled([...this.running]);
    await this.writes.catch(() => undefined);
    await this.lock.release();
  }

  /**
   * Applies a change to a copy, persists the copy, and only then adopts it. A
   * change returning `false` made none, and nothing is written.
   */
  private mutate(
    change: (draft: Map<string, MemoryJobState>) => boolean | void,
  ): Promise<void> {
    const write = this.writes
      .catch(() => undefined)
      .then(async () => {
        const draft = new Map(this.state);
        if (change(draft) === false) return;
        await this.file.write(draft);
        this.state = draft;
      });
    this.writes = write;
    return write;
  }

  private arm(name: string): void {
    this.disarm(name);
    const job = this.state.get(name);
    if (!this.runner || !job || job.nextRunAt === null) return;
    const scheduledAt = job.nextRunAt;
    if (scheduledAt <= Date.now()) {
      this.timers.set(
        name,
        setTimeout(() => this.enqueue(name, scheduledAt), 0),
      );
      return;
    }
    try {
      this.timers.set(
        name,
        CronJob.from({
          cronTime: new Date(scheduledAt),
          onTick: () => this.enqueue(name, scheduledAt),
          start: true,
        }),
      );
    } catch {
      // `cron` refuses a date that became past while it was being scheduled.
      this.timers.set(
        name,
        setTimeout(() => this.enqueue(name, scheduledAt), 0),
      );
    }
  }

  private disarm(name: string): void {
    const timer = this.timers.get(name);
    this.timers.delete(name);
    if (timer instanceof CronJob) void timer.stop();
    else if (timer) clearTimeout(timer);
  }

  private dropQueued(name: string): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index].name === name) this.queue.splice(index, 1);
    }
  }

  private enqueue(name: string, scheduledAt: number): void {
    this.timers.delete(name);
    if (!this.runner) return;
    this.queue.push({ name, scheduledAt });
    this.pump();
  }

  private pump(): void {
    while (
      this.runner &&
      this.running.size < this.config.concurrency &&
      this.queue.length > 0
    ) {
      const firing = this.queue.shift()!;
      const execution = this.start(firing).catch((error: unknown) => {
        this.logger?.error(
          { error, jobName: firing.name },
          'A memory schedule firing failed unexpectedly',
        );
      });
      const tracked = execution.finally(() => {
        this.running.delete(tracked);
        this.pump();
      });
      this.running.add(tracked);
    }
  }

  private async start(firing: QueuedFiring): Promise<void> {
    let current: MemoryJobState | undefined;
    try {
      await this.mutate((draft) => {
        const job = draft.get(firing.name);
        // Replaced or removed since this firing was planned.
        if (!job || job.nextRunAt !== firing.scheduledAt) return false;
        const fired = job.fired + 1;
        current = {
          ...job,
          fired,
          nextRunAt: nextFiring(
            job.options,
            firing.scheduledAt,
            fired,
            Date.now(),
          ),
        };
        draft.set(firing.name, current);
        return true;
      });
    } catch (error) {
      // Nothing runs on state that is not on disk: the firing waits and tries
      // again, and after a restart it is a missed firing that runs once.
      this.logger?.error(
        { error, jobName: firing.name, statePath: this.file.filePath },
        'Failed to persist a schedule firing; retrying',
      );
      if (this.runner) {
        const retry = setTimeout(
          () => this.enqueue(firing.name, firing.scheduledAt),
          PERSIST_RETRY_DELAY,
        );
        this.timers.set(firing.name, retry);
      }
      return;
    }
    if (!current || !this.runner) return;
    this.arm(firing.name);
    await this.execute(firing, current);
  }

  private async execute(
    firing: QueuedFiring,
    job: MemoryJobState,
  ): Promise<void> {
    const runner = this.runner!;
    const jobId = `${firing.name}:${firing.scheduledAt}`;
    const scheduledAt = new Date(firing.scheduledAt);
    const attempts = Number(job.settings.attempts ?? this.config.attempts);
    const signal = this.abort.signal;
    for (let attempt = 1; ; attempt += 1) {
      const runAt = new Date();
      const nextRunAt = this.nextRunAt(firing.name);
      const base = {
        jobId,
        jobName: firing.name,
        scheduledAt,
        runAt,
        ...(nextRunAt ? { nextRunAt } : {}),
      };
      runner.emit({ name: 'ScheduleStart', ...base });
      try {
        await runner.run({ ...base, signal });
        runner.emit({ name: 'ScheduleEnd', ...base });
        return;
      } catch (caught) {
        const error =
          caught instanceof Error ? caught : new Error(String(caught));
        const notRegistered =
          error instanceof ScheduleHandlerNotRegisteredError;
        runner.emit({
          name: 'ScheduleError',
          ...base,
          reason: notRegistered ? 'handler-not-registered' : 'execute-failed',
          error,
        });
        if (notRegistered || attempt >= attempts || signal.aborted) return;
      }
    }
  }

  private nextRunAt(name: string): Date | undefined {
    const next = this.state.get(name)?.nextRunAt;
    return next === null || next === undefined ? undefined : new Date(next);
  }
}

function toStoredRule(job: MemoryJobState): StoredScheduleRule {
  return {
    options: job.options,
    payload: job.payload,
    settings: job.settings,
    ...(job.nextRunAt !== null ? { nextRunAt: new Date(job.nextRunAt) } : {}),
  };
}

function toJobScheduler(name: string, job: MemoryJobState): JobScheduler {
  return {
    jobName: name,
    options: job.options,
    payload: job.payload,
    ...(job.nextRunAt !== null ? { nextRunAt: new Date(job.nextRunAt) } : {}),
  };
}

function jsonCopy(value: unknown): unknown {
  const text = JSON.stringify(value);
  return text === undefined ? undefined : (JSON.parse(text) as unknown);
}
