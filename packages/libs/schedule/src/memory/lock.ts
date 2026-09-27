import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { ScheduleLogger } from '../types.js';

export interface MemoryLockHolder {
  readonly hostname: string;
  readonly pid: number;
  readonly acquiredAt: string;
  /** Distinguishes this acquisition from a later one by the same pid. */
  readonly token: string;
}

/** Host facts the lock reads, replaceable in tests. */
export interface MemoryLockEnvironment {
  readonly hostname: () => string;
  readonly pid: number;
  /** Whether a process with this pid runs on this host. */
  readonly isAlive: (pid: number) => boolean;
}

export const defaultLockEnvironment: MemoryLockEnvironment = {
  hostname: () => os.hostname(),
  pid: process.pid,
  isAlive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // EPERM: the process exists but belongs to someone else.
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  },
};

export interface MemoryWriteLockTimings {
  /** How long a write waits for the lock before it fails. */
  readonly timeout: number;
  /** A lock held longer than this is left behind: a write holds it for milliseconds. */
  readonly staleAfter: number;
  /** The longest pause between two attempts; each pause is random up to it. */
  readonly retryDelay: number;
}

export const defaultLockTimings: MemoryWriteLockTimings = {
  timeout: 10_000,
  staleAfter: 30_000,
  retryDelay: 20,
};

/**
 * The exclusive lock around one read-modify-write of a state file, held by
 * creating a lock file that must not exist yet and removed as soon as the
 * write is done. Reads take no lock: a state file is replaced by rename, so a
 * reader sees either the previous version or the next one, whole.
 *
 * A lock whose holder is gone is taken over — at once when its pid no longer
 * runs on this host, and otherwise once it has been held far longer than any
 * write takes, which also covers a pid reused by an unrelated process and a
 * holder on another host.
 */
export class MemoryWriteLock {
  public constructor(
    public readonly lockPath: string,
    private readonly logger: ScheduleLogger | undefined,
    private readonly environment: MemoryLockEnvironment = defaultLockEnvironment,
    private readonly timings: MemoryWriteLockTimings = defaultLockTimings,
  ) {}

  public async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const holder = await this.acquire();
    try {
      return await operation();
    } finally {
      await this.release(holder);
    }
  }

  private async acquire(): Promise<MemoryLockHolder> {
    await mkdir(path.dirname(this.lockPath), { recursive: true });
    const deadline = Date.now() + this.timings.timeout;
    for (;;) {
      const holder: MemoryLockHolder = {
        hostname: this.environment.hostname(),
        pid: this.environment.pid,
        acquiredAt: new Date().toISOString(),
        token: randomUUID(),
      };
      if (await this.tryCreate(holder)) return holder;
      const existing = await this.readHolder();
      if (existing && (await this.takeOverIfLeft(existing, holder))) continue;
      if (Date.now() >= deadline) {
        throw new Error(
          existing
            ? `Timed out waiting for schedule state lock ${this.lockPath}, held by pid ${existing.pid} on host "${existing.hostname}" since ${existing.acquiredAt}.`
            : `Timed out waiting for schedule state lock ${this.lockPath}.`,
        );
      }
      await sleep(1 + Math.random() * this.timings.retryDelay);
    }
  }

  private async takeOverIfLeft(
    existing: MemoryLockHolder,
    self: MemoryLockHolder,
  ): Promise<boolean> {
    const heldFor = Date.now() - Date.parse(existing.acquiredAt);
    const sameHost = existing.hostname === self.hostname;
    const reason =
      sameHost &&
      existing.pid !== self.pid &&
      !this.environment.isAlive(existing.pid)
        ? 'Taking over a schedule state lock left by a process that no longer runs'
        : heldFor > this.timings.staleAfter
          ? 'Taking over a schedule state lock held for longer than any write takes'
          : undefined;
    if (!reason) return false;
    // Only the lock that was judged left behind is removed: another process
    // may have taken it over and created a fresh one in the meantime.
    const current = await this.readHolder();
    if (current?.token !== existing.token) return true;
    this.logger?.warn(
      {
        lockPath: this.lockPath,
        pid: existing.pid,
        hostname: existing.hostname,
        acquiredAt: existing.acquiredAt,
      },
      reason,
    );
    await rm(this.lockPath, { force: true });
    return true;
  }

  private async release(holder: MemoryLockHolder): Promise<void> {
    const existing = await this.readHolder().catch(() => undefined);
    if (existing?.token === holder.token) {
      await rm(this.lockPath, { force: true });
    }
  }

  private async tryCreate(holder: MemoryLockHolder): Promise<boolean> {
    let handle;
    try {
      handle = await open(this.lockPath, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw new Error(
        `Failed to create schedule state lock ${this.lockPath}.`,
        { cause: error },
      );
    }
    try {
      await handle.writeFile(`${JSON.stringify(holder)}\n`);
    } finally {
      await handle.close();
    }
    return true;
  }

  /**
   * The current holder, or undefined when there is none. A lock file that is
   * not readable yet was just created and is being written; one that stays
   * unreadable is reported as a holder from the time it was created, so it is
   * eventually taken over like any other lock left behind.
   */
  private async readHolder(): Promise<MemoryLockHolder | undefined> {
    let text: string;
    try {
      text = await readFile(this.lockPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    try {
      const parsed = JSON.parse(text) as Partial<MemoryLockHolder>;
      if (
        typeof parsed.hostname === 'string' &&
        typeof parsed.pid === 'number' &&
        typeof parsed.acquiredAt === 'string'
      ) {
        return {
          hostname: parsed.hostname,
          pid: parsed.pid,
          acquiredAt: parsed.acquiredAt,
          token: parsed.token ?? '',
        };
      }
    } catch {
      // Reported below as a holder of unknown identity.
    }
    const created = await stat(this.lockPath).catch(() => undefined);
    if (!created) return undefined;
    return {
      hostname: '',
      pid: 0,
      acquiredAt: new Date(created.mtimeMs).toISOString(),
      token: `unreadable:${created.mtimeMs}`,
    };
  }
}
