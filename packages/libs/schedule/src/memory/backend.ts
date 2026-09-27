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
  defaultLockTimings,
  MemoryWriteLock,
  type MemoryLockEnvironment,
} from './lock.js';
import {
  EMPTY_MEMORY_STATE,
  memoryStateFileBase,
  MemoryStateFile,
  type MemoryJobState,
  type MemoryStateSnapshot,
} from './state-file.js';
import { firstFiring, nextFiring } from './timing.js';

/** How long a firing whose state could not be written waits before it tries again. */
const PERSIST_RETRY_DELAY = 5_000;
const DEFAULT_POLL_INTERVAL = 1_000;

export interface InMemoryScheduleBackendOptions {
  readonly lockEnvironment?: MemoryLockEnvironment;
  /** How long a write waits for the state lock before it fails. */
  readonly lockTimeout?: number;
  /** How long a state lock may be held before it counts as left behind. */
  readonly lockStaleAfter?: number;
  readonly lockRetryDelay?: number;
  /** How often a consuming process looks for changes other processes made. */
  readonly pollInterval?: number;
}

interface QueuedFiring {
  readonly name: string;
  readonly scheduledAt: number;
}

/** The state file is being written from another host at the same time. */
class SharedAcrossHostsError extends Error {
  public constructor(filePath: string, hostname: string) {
    super(
      `Schedule state file ${filePath} is written from host "${hostname}" as well. The memory adapter serves the processes of one host; use the redis adapter to run on several hosts.`,
    );
    this.name = 'SharedAcrossHostsError';
  }
}

/**
 * Schedules in the processes of one host, sharing one state file per namespace
 * and scope that holds every rule, its next firing and its firing count.
 *
 * Reads take no lock: the file is replaced by rename, so it is always whole.
 * Every change is a read-modify-write under a short exclusive lock, reading
 * the file again inside it. Each consuming process arms a one-shot `cron`
 * job, created from a `Date`, for every planned firing; when one fires, the
 * process claims it under the lock by advancing the rule past it, and only
 * the process whose claim succeeds runs the handler. A consuming process
 * polls the file for rules the others changed.
 */
export class InMemoryScheduleBackend implements ScheduleBackend {
  public readonly settings: ScheduleExecutionSettings;
  private readonly file: MemoryStateFile;
  private readonly lock: MemoryWriteLock;
  private readonly hostname: string;
  private readonly pid: number;
  private readonly pollInterval: number;
  private snapshot: MemoryStateSnapshot = EMPTY_MEMORY_STATE;
  private signature: string | undefined;
  /** The newest revision seen; a newer one written from another host means sharing. */
  private seenRevision = 0;
  private operations: Promise<unknown> = Promise.resolve();
  private readonly timers = new Map<string, CronJob | NodeJS.Timeout>();
  /** The planned firing each armed timer is for. */
  private readonly armed = new Map<string, number>();
  private readonly queue: QueuedFiring[] = [];
  private readonly running = new Set<Promise<void>>();
  private runner: ScheduleRunner | undefined;
  private abort = new AbortController();
  private poller: NodeJS.Timeout | undefined;
  private sharingReported = false;

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
    const environment = options.lockEnvironment ?? defaultLockEnvironment;
    this.hostname = environment.hostname();
    this.pid = environment.pid;
    this.pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.lock = new MemoryWriteLock(`${base}.lock`, logger, environment, {
      timeout: options.lockTimeout ?? defaultLockTimings.timeout,
      staleAfter: options.lockStaleAfter ?? defaultLockTimings.staleAfter,
      retryDelay: options.lockRetryDelay ?? defaultLockTimings.retryDelay,
    });
  }

  public get statePath(): string {
    return this.file.filePath;
  }

  public async open(): Promise<void> {
    // A file another host wrote before this process started is adopted: the
    // storage may simply have moved. Writes from it from now on are not.
    const snapshot = await this.file.read();
    this.seenRevision = snapshot.revision;
    this.snapshot = snapshot;
  }

  public async read(name: string): Promise<StoredScheduleRule | undefined> {
    const job = (await this.refresh()).jobs.get(name);
    return job ? toStoredRule(job) : undefined;
  }

  public async write(
    rule: ScheduleRuleWrite,
    unchanged?: (stored: StoredScheduleRule) => boolean,
  ): Promise<Date | undefined> {
    if (rule.options.endDate && rule.options.endDate.getTime() <= Date.now()) {
      // A rule that already ended is not stored, the way the redis adapter
      // (and BullMQ, which refuses it) behaves.
      await this.remove(rule.name);
      return undefined;
    }
    const nextRunAt = await this.transact((jobs) => {
      const existing = jobs.get(rule.name);
      // Decided again under the lock: another process may have written the
      // same rule since the caller looked.
      if (existing && unchanged?.(toStoredRule(existing))) {
        return { changed: false, result: existing.nextRunAt };
      }
      const next = firstFiring(
        rule.options,
        Date.now(),
        rule.immediately && !existing,
      );
      jobs.set(rule.name, {
        options: rule.options,
        payload: jsonCopy(rule.payload),
        settings: rule.settings,
        nextRunAt: next,
        fired: 0,
      });
      // The rule replaces the one before it, and with it any firing of the
      // old rule still waiting here for a free slot.
      this.dropQueued(rule.name);
      return { changed: true, result: next };
    });
    return nextRunAt === null ? undefined : new Date(nextRunAt);
  }

  public async remove(name: string): Promise<boolean> {
    return this.transact((jobs) => {
      if (!jobs.delete(name)) return { changed: false, result: false };
      this.dropQueued(name);
      return { changed: true, result: true };
    });
  }

  public async count(): Promise<number> {
    return (await this.refresh()).jobs.size;
  }

  public async list(start: number, end: number): Promise<JobScheduler[]> {
    const ordered = [...(await this.refresh()).jobs]
      .sort(([leftName, left], [rightName, right]) => {
        const byNext =
          (left.nextRunAt ?? Number.POSITIVE_INFINITY) -
          (right.nextRunAt ?? Number.POSITIVE_INFINITY);
        if (byNext !== 0 && !Number.isNaN(byNext)) return byNext;
        return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
      })
      .map(([name, job]) => toJobScheduler(name, job));
    const stop = end < 0 ? ordered.length + end + 1 : end + 1;
    return ordered.slice(Math.max(start, 0), stop);
  }

  public async consume(runner: ScheduleRunner): Promise<void> {
    this.runner = runner;
    this.abort = new AbortController();
    await this.refresh();
    // A firing missed while nothing ran is due now and fires once; the next
    // one is computed from the present when it is claimed.
    this.rearm();
    this.schedulePoll();
  }

  public async close(): Promise<void> {
    this.runner = undefined;
    if (this.poller) clearTimeout(this.poller);
    this.poller = undefined;
    for (const name of [...this.timers.keys()]) this.disarm(name);
    this.queue.length = 0;
    this.abort.abort(new Error('The schedule executor is shutting down.'));
    await Promise.allSettled([...this.running]);
    await this.operations.catch(() => undefined);
  }

  /**
   * One read-modify-write under the lock. This process's own changes also
   * queue behind each other, so it never waits on a lock it holds itself.
   */
  private transact<T>(
    change: (jobs: Map<string, MemoryJobState>) => {
      readonly changed: boolean;
      readonly result: T;
    },
  ): Promise<T> {
    const operation = this.operations
      .catch(() => undefined)
      .then(() =>
        this.lock.withLock(async () => {
          const current = await this.file.read();
          this.checkWriter(current);
          const jobs = new Map(current.jobs);
          const { changed, result } = change(jobs);
          if (!changed) {
            this.adopt(current);
            return result;
          }
          const next: MemoryStateSnapshot = {
            revision: current.revision + 1,
            writer: { hostname: this.hostname, pid: this.pid },
            jobs,
          };
          await this.file.write(next);
          this.seenRevision = next.revision;
          this.adopt(next);
          return result;
        }),
      );
    this.operations = operation;
    return operation;
  }

  /** Reads the file without the lock and adopts it when it is newer. */
  private async refresh(): Promise<MemoryStateSnapshot> {
    const signature = await this.file.signature();
    if (signature !== undefined && signature === this.signature)
      return this.snapshot;
    const current = await this.file.read();
    this.checkWriter(current);
    this.signature = signature;
    this.adopt(current);
    return this.snapshot;
  }

  private checkWriter(current: MemoryStateSnapshot): void {
    if (
      current.revision > this.seenRevision &&
      current.writer &&
      current.writer.hostname !== this.hostname
    ) {
      throw new SharedAcrossHostsError(
        this.file.filePath,
        current.writer.hostname,
      );
    }
    this.seenRevision = Math.max(this.seenRevision, current.revision);
  }

  private adopt(current: MemoryStateSnapshot): void {
    if (current.revision < this.snapshot.revision) return;
    this.snapshot = current;
    this.rearm();
  }

  private schedulePoll(): void {
    if (!this.runner) return;
    this.poller = setTimeout(() => {
      void this.refresh()
        .catch((error: unknown) => {
          if (error instanceof SharedAcrossHostsError) {
            if (this.sharingReported) return;
            this.sharingReported = true;
          }
          this.logger?.error(
            { error, statePath: this.file.filePath },
            'Failed to read the schedule state file',
          );
        })
        .finally(() => this.schedulePoll());
    }, this.pollInterval);
    this.poller.unref?.();
  }

  /** Makes the armed timers match the planned firings of the current snapshot. */
  private rearm(): void {
    if (!this.runner) return;
    for (const name of [...this.armed.keys()]) {
      if (!this.snapshot.jobs.has(name)) this.disarm(name);
    }
    for (const [name, job] of this.snapshot.jobs) {
      if (job.nextRunAt === null) this.disarm(name);
      else if (this.armed.get(name) !== job.nextRunAt)
        this.arm(name, job.nextRunAt);
    }
  }

  private arm(name: string, scheduledAt: number): void {
    this.disarm(name);
    this.armed.set(name, scheduledAt);
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
    this.armed.delete(name);
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
    let claimed: MemoryJobState | undefined;
    try {
      claimed = await this.transact((jobs) => {
        const job = jobs.get(firing.name);
        // Claimed by another process, or replaced or removed since this
        // firing was planned.
        if (!job || job.nextRunAt !== firing.scheduledAt) {
          return { changed: false, result: undefined };
        }
        const fired = job.fired + 1;
        const next: MemoryJobState = {
          ...job,
          fired,
          nextRunAt: nextFiring(
            job.options,
            firing.scheduledAt,
            fired,
            Date.now(),
          ),
        };
        jobs.set(firing.name, next);
        return { changed: true, result: next };
      });
    } catch (error) {
      const shared = error instanceof SharedAcrossHostsError;
      this.logger?.error(
        { error, jobName: firing.name, statePath: this.file.filePath },
        shared
          ? 'Failed to claim a schedule firing'
          : 'Failed to persist a schedule firing; retrying',
      );
      // Nothing runs on a claim that is not on disk: the firing waits and
      // tries again, and after a restart it is a missed firing that runs once.
      if (this.runner && !shared) {
        this.armed.set(firing.name, firing.scheduledAt);
        this.timers.set(
          firing.name,
          setTimeout(
            () => this.enqueue(firing.name, firing.scheduledAt),
            PERSIST_RETRY_DELAY,
          ),
        );
      }
      return;
    }
    if (!claimed || !this.runner) return;
    await this.execute(firing, claimed);
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
    const next = this.snapshot.jobs.get(name)?.nextRunAt;
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
