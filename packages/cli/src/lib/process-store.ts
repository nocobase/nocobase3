import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ProcessRecord {
  pid: number;
  startedAt: string;
  port: number;
  host: string;
}

export interface RunningProcess extends ProcessRecord {
  running: boolean;
}

function pidPath(stateDirectory: string): string {
  return path.join(stateDirectory, 'hub.pid');
}

/**
 * Signal 0 performs the kernel's permission and existence checks without delivering anything, which is the standard
 * way to ask whether a pid is still alive. EPERM means the process exists but belongs to someone else, so it counts
 * as running.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function writeProcessRecord(
  stateDirectory: string,
  record: ProcessRecord,
): Promise<void> {
  await writeFile(
    pidPath(stateDirectory),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Reads the recorded process and reports whether it is still alive.
 *
 * A stale record is normal rather than exceptional: a machine can reboot, or a process can be killed, without anything
 * cleaning the file up. Callers get `running: false` and can decide whether to clear it.
 */
export async function readProcessRecord(
  stateDirectory: string,
): Promise<RunningProcess | undefined> {
  let raw: string;

  try {
    raw = await readFile(pidPath(stateDirectory), 'utf8');
  } catch {
    return undefined;
  }

  try {
    const record = JSON.parse(raw) as ProcessRecord;
    return { ...record, running: isProcessAlive(record.pid) };
  } catch {
    return undefined;
  }
}

export async function clearProcessRecord(
  stateDirectory: string,
): Promise<void> {
  await rm(pidPath(stateDirectory), { force: true });
}

export interface StopResult {
  stopped: boolean;
  pid?: number;
}

/**
 * Asks a process to stop, escalating to SIGKILL only if it ignores SIGTERM.
 *
 * The graceful signal comes first so the server can close its listeners and finish in-flight requests; the deadline
 * exists because a wedged process would otherwise leave the hub un-stoppable.
 */
export async function stopProcess(
  pid: number,
  graceMs = 5000,
): Promise<StopResult> {
  if (!isProcessAlive(pid)) {
    return { stopped: false };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return { stopped: false };
  }

  const deadline = Date.now() + graceMs;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return { pid, stopped: true };
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone between the last check and here.
  }

  return { pid, stopped: true };
}
