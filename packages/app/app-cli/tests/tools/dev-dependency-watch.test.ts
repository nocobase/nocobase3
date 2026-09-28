// @vitest-environment node
import path from 'node:path';
import { expect, it } from 'vitest';

import {
  DEPENDENCY_SETTLE_MS,
  resolveDependencyWatch,
} from '../../src/tools/scripts/dev/dependency-watch.mjs';
import {
  DEV_SHUTDOWN_TIMEOUT_MS,
  resolveDevShutdownEnv,
  SHUTDOWN_TIMEOUT_ENV,
} from '../../src/tools/scripts/dev/shutdown-budget.mjs';

it('watches the manifest and what a package manager writes while installing', () => {
  const watches = resolveDependencyWatch('/app');

  expect(watches.map((watch) => watch.directory)).toEqual([
    '/app',
    path.join('/app', 'node_modules'),
  ]);
  expect([...watches[0].filenames]).toContain('package.json');
  expect([...watches[0].filenames]).toContain('pnpm-lock.yaml');
  // Linking finishes last, so this is what says the install is really done.
  expect([...watches[1].filenames]).toContain('.modules.yaml');
});

it('waits long enough for an install to finish writing', () => {
  // An install writes package.json first and keeps writing; restarting on that
  // first write lands on a half-installed node_modules.
  expect(DEPENDENCY_SETTLE_MS).toBeGreaterThanOrEqual(2000);
});

it('keeps the development shutdown budget inside the supervisor deadline', () => {
  // tsx watch force-kills five seconds after SIGTERM, and a hard kill skips
  // releasing the migration lock.
  expect(DEV_SHUTDOWN_TIMEOUT_MS).toBeLessThan(5000);
  expect(resolveDevShutdownEnv({})).toEqual({
    [SHUTDOWN_TIMEOUT_ENV]: String(DEV_SHUTDOWN_TIMEOUT_MS),
  });
});

it('keeps an explicit budget from the environment', () => {
  expect(resolveDevShutdownEnv({ [SHUTDOWN_TIMEOUT_ENV]: '12000' })).toEqual({
    [SHUTDOWN_TIMEOUT_ENV]: '12000',
  });
});
