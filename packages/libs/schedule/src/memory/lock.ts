import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

/**
 * An exclusive lock on one state file, held by creating a lock file that must
 * not exist yet. A lock left by a crashed process on this host is taken over;
 * a live holder, or any holder on another host, refuses the lock, because a
 * shared file system gives no way to tell whether that process still runs.
 */
export class MemoryStateLock {
  private holder: MemoryLockHolder | undefined;

  public constructor(
    public readonly lockPath: string,
    private readonly logger: ScheduleLogger | undefined,
    private readonly environment: MemoryLockEnvironment = defaultLockEnvironment,
  ) {}

  public async acquire(): Promise<void> {
    await mkdir(path.dirname(this.lockPath), { recursive: true });
    const holder: MemoryLockHolder = {
      hostname: this.environment.hostname(),
      pid: this.environment.pid,
      acquiredAt: new Date().toISOString(),
      token: randomUUID(),
    };
    // Two attempts: the second follows the removal of a stale lock. Losing
    // that race to another process surfaces as a live holder on the re-read.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (await this.tryCreate(holder)) {
        this.holder = holder;
        return;
      }
      const existing = await this.readHolder();
      if (!existing) continue;
      if (existing.hostname !== holder.hostname) {
        throw new Error(
          `Schedule state lock ${this.lockPath} is held by pid ${existing.pid} on host "${existing.hostname}" since ${existing.acquiredAt}. The memory adapter cannot tell whether a process on another host still runs; stop it, or delete the lock file once you are sure it is gone. Use the redis adapter to run more than one instance.`,
        );
      }
      if (
        existing.pid === this.environment.pid ||
        this.environment.isAlive(existing.pid)
      ) {
        throw new Error(
          `Schedule state lock ${this.lockPath} is held by running process ${existing.pid} on this host since ${existing.acquiredAt}. The memory adapter serves one process only; if that pid now belongs to an unrelated process, delete the lock file.`,
        );
      }
      this.logger?.warn(
        {
          lockPath: this.lockPath,
          pid: existing.pid,
          acquiredAt: existing.acquiredAt,
        },
        'Taking over a schedule state lock left by a process that no longer runs',
      );
      await rm(this.lockPath, { force: true });
    }
    throw new Error(
      `Could not acquire schedule state lock ${this.lockPath}: another process keeps taking it.`,
    );
  }

  /** Removes the lock file if this acquisition still owns it. */
  public async release(): Promise<void> {
    const holder = this.holder;
    this.holder = undefined;
    if (!holder) return;
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
      await handle.sync();
    } finally {
      await handle.close();
    }
    return true;
  }

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
        typeof parsed.pid === 'number'
      ) {
        return parsed as MemoryLockHolder;
      }
    } catch {
      // Reported below.
    }
    throw new Error(
      `Schedule state lock ${this.lockPath} is unreadable; delete it once no process uses the state file.`,
    );
  }
}
