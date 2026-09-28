// @vitest-environment node
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import {
  acquireDevInstanceLock,
  DEV_INSTANCE_LOCK_FILE,
} from '../../src/tools/scripts/dev/instance-lock.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const created = mkdtempSync(path.join(tmpdir(), 'dev-instance-lock-'));
  roots.push(created);
  return created;
}

function lockFile(rootDir: string): string {
  return path.join(rootDir, DEV_INSTANCE_LOCK_FILE);
}

it('records the run that owns the application root', () => {
  const rootDir = root();
  const lock = acquireDevInstanceLock({
    rootDir,
    pid: process.pid,
    startedAt: 1000,
  });

  expect(lock.acquired).toBe(true);
  expect(JSON.parse(readFileSync(lockFile(rootDir), 'utf8'))).toEqual({
    pid: process.pid,
    startedAt: 1000,
  });

  lock.release?.();
  expect(() => readFileSync(lockFile(rootDir), 'utf8')).toThrow();
});

it('refuses a second run while the first one is alive', () => {
  const rootDir = root();
  acquireDevInstanceLock({ rootDir, pid: process.pid, startedAt: 2000 });

  const second = acquireDevInstanceLock({ rootDir, pid: process.pid + 1 });
  expect(second).toMatchObject({
    acquired: false,
    pid: process.pid,
    startedAt: 2000,
  });
});

it('takes over a lock whose process is gone', () => {
  const rootDir = root();
  mkdirSync(path.dirname(lockFile(rootDir)), { recursive: true });
  // A pid no process can hold, as a killed run would have left behind.
  writeFileSync(
    lockFile(rootDir),
    JSON.stringify({ pid: 2 ** 31 - 1, startedAt: 1 }),
  );

  const lock = acquireDevInstanceLock({
    rootDir,
    pid: process.pid,
    startedAt: 3000,
  });
  expect(lock.acquired).toBe(true);
  expect(JSON.parse(readFileSync(lockFile(rootDir), 'utf8')).pid).toBe(
    process.pid,
  );
});

it('leaves a lock another run has claimed since', () => {
  const rootDir = root();
  const lock = acquireDevInstanceLock({
    rootDir,
    pid: process.pid,
    startedAt: 4000,
  });
  writeFileSync(
    lockFile(rootDir),
    JSON.stringify({ pid: process.pid + 1, startedAt: 5000 }),
  );

  lock.release?.();
  expect(JSON.parse(readFileSync(lockFile(rootDir), 'utf8')).pid).toBe(
    process.pid + 1,
  );
});

it('treats an unreadable lock as free', () => {
  const rootDir = root();
  mkdirSync(path.dirname(lockFile(rootDir)), { recursive: true });
  writeFileSync(lockFile(rootDir), 'not json');

  expect(acquireDevInstanceLock({ rootDir }).acquired).toBe(true);
});
