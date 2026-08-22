import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearProcessRecord,
  isProcessAlive,
  readProcessRecord,
  stopProcess,
  writeProcessRecord,
} from '../src/lib/process-store.ts';

const directories: string[] = [];
const pids: number[] = [];

afterEach(async () => {
  for (const pid of pids.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }

  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createStateDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nb3-process-test-'));
  directories.push(directory);

  return directory;
}

/** A process that stays alive until it is killed, so liveness checks have something real to observe. */
function startLongRunningProcess(): number {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  pids.push(child.pid as number);

  return child.pid as number;
}

/** A pid that is guaranteed not to be running, taken from a process that has already exited. */
function deadPid(): number {
  return spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid as number;
}

describe('isProcessAlive', () => {
  it('sees a running process', () => {
    expect(isProcessAlive(startLongRunningProcess())).toBe(true);
  });

  it('sees that an exited process is gone', () => {
    expect(isProcessAlive(deadPid())).toBe(false);
  });

  it('treats pid 1 as alive, since it exists but is not ours to signal', () => {
    expect(isProcessAlive(1)).toBe(true);
  });
});

describe('readProcessRecord', () => {
  it('returns nothing when no process was ever recorded', async () => {
    expect(
      await readProcessRecord(await createStateDirectory()),
    ).toBeUndefined();
  });

  it('reports a recorded process that is still running', async () => {
    const directory = await createStateDirectory();
    const pid = startLongRunningProcess();

    await writeProcessRecord(directory, {
      host: '127.0.0.1',
      pid,
      port: 3000,
      startedAt: '2026-08-22T00:00:00.000Z',
    });
    const record = await readProcessRecord(directory);

    expect(record?.pid).toBe(pid);
    expect(record?.running).toBe(true);
  });

  /**
   * A machine can reboot, or a process can be killed, without anything cleaning the file up. A stale record has to read
   * as "not running" rather than as an error, or `hub status` would report a hub that died days ago as up.
   */
  it('reports a recorded process that has since died as not running', async () => {
    const directory = await createStateDirectory();

    await writeProcessRecord(directory, {
      host: '127.0.0.1',
      pid: deadPid(),
      port: 3000,
      startedAt: '2026-08-22T00:00:00.000Z',
    });

    expect((await readProcessRecord(directory))?.running).toBe(false);
  });

  it('ignores a corrupt record rather than crashing', async () => {
    const directory = await createStateDirectory();
    await writeFile(path.join(directory, 'hub.pid'), 'not json at all', 'utf8');

    expect(await readProcessRecord(directory)).toBeUndefined();
  });
});

describe('writeProcessRecord', () => {
  it('writes readable json', async () => {
    const directory = await createStateDirectory();

    await writeProcessRecord(directory, {
      host: '127.0.0.1',
      pid: 1234,
      port: 3000,
      startedAt: 'now',
    });
    const raw = await readFile(path.join(directory, 'hub.pid'), 'utf8');

    expect(raw).toContain('\n');
    expect(raw.endsWith('\n')).toBe(true);
  });
});

describe('clearProcessRecord', () => {
  it('removes the record', async () => {
    const directory = await createStateDirectory();

    await writeProcessRecord(directory, {
      host: '127.0.0.1',
      pid: 1234,
      port: 3000,
      startedAt: 'now',
    });
    await clearProcessRecord(directory);

    expect(await readProcessRecord(directory)).toBeUndefined();
  });

  it('does nothing when there is no record', async () => {
    await expect(
      clearProcessRecord(await createStateDirectory()),
    ).resolves.toBeUndefined();
  });
});

describe('stopProcess', () => {
  it('stops a running process', async () => {
    const pid = startLongRunningProcess();
    const result = await stopProcess(pid);

    expect(result.stopped).toBe(true);
    expect(isProcessAlive(pid)).toBe(false);
  });

  it('reports that an already dead process was not stopped', async () => {
    expect((await stopProcess(deadPid())).stopped).toBe(false);
  });

  /**
   * A process that ignores SIGTERM must still end, or the hub would be un-stoppable. The grace period is short here so
   * the escalation is what the test actually observes.
   */
  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    // The child announces itself once its SIGTERM handler is installed. Signalling before that point would let the
    // default action kill it, and the escalation this test exists to check would never run.
    const child = spawn(
      process.execPath,
      [
        '-e',
        "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)",
      ],
      { detached: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    child.unref();
    const pid = child.pid as number;
    pids.push(pid);

    await new Promise<void>((resolve) => {
      child.stdout?.once('data', () => resolve());
    });

    // Give SIGTERM time to be ignored, then confirm the process is gone anyway. Waiting well past the grace period is
    // what distinguishes an escalation from a process that simply had not died yet.
    const result = await stopProcess(pid, 300);

    for (let attempt = 0; attempt < 20 && isProcessAlive(pid); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(result.stopped).toBe(true);
    expect(
      isProcessAlive(pid),
      'SIGTERM was ignored, so SIGKILL should have ended it',
    ).toBe(false);
  });
});

/**
 * A start script is normally a package-manager wrapper that spawns the real server as a grandchild. Signalling only the
 * recorded pid would kill the wrapper and leave the server running, still holding its port — which is exactly what
 * happened before stopping switched to the process group.
 */
describe('stopProcess with a child of its own', () => {
  it('takes the whole process group down, not just the recorded process', async () => {
    const script = [
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      'console.log(child.pid);',
      'setInterval(() => {}, 1000);',
    ].join('\n');

    const parent = spawn(process.execPath, ['-e', script], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    parent.unref();
    const parentPid = parent.pid as number;
    pids.push(parentPid);

    const childPid = await new Promise<number>((resolve) => {
      parent.stdout?.once('data', (chunk: Buffer) =>
        resolve(Number(chunk.toString().trim())),
      );
    });
    pids.push(childPid);

    expect(isProcessAlive(childPid)).toBe(true);

    await stopProcess(parentPid, 300);

    for (
      let attempt = 0;
      attempt < 20 && isProcessAlive(childPid);
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(
      isProcessAlive(parentPid),
      'the recorded process should be gone',
    ).toBe(false);
    expect(
      isProcessAlive(childPid),
      'the grandchild holding the port should be gone too',
    ).toBe(false);
  });
});
