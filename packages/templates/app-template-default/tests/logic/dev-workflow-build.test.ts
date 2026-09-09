// @vitest-environment node

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('../../scripts/dev/index.mjs', import.meta.url),
  'utf8',
);
// Exercise the preflight without launching the long-running development servers.
const preflight = source.slice(
  source.indexOf('const workflowBuild ='),
  source.indexOf('const pluginWatchIncludes ='),
);

function runPreflight(result: { status?: number | null; error?: Error }) {
  const sync = vi.fn(() => result);
  const exit = vi.fn();
  const env = { APP_SERVER_PORT: '13000' };
  runInNewContext(preflight, {
    spawn: { sync },
    rootDir: '/app',
    nextEnv: env,
    process: { exit },
  });
  return { sync, exit, env };
}

describe('development workflow preflight', () => {
  it('builds workflows through the application CLI', () => {
    const { sync, exit, env } = runPreflight({ status: 0 });
    expect(sync).toHaveBeenCalledWith(
      'pnpm',
      ['nocobase', 'workflow', 'build'],
      { cwd: '/app', env, stdio: 'inherit' },
    );
    expect(exit).not.toHaveBeenCalled();
  });

  it('preserves a failed build exit status', () => {
    expect(runPreflight({ status: 2 }).exit).toHaveBeenCalledWith(2);
  });

  it('treats a terminated build as a failure', () => {
    expect(runPreflight({ status: null }).exit).toHaveBeenCalledWith(1);
  });

  it('propagates command launch errors', () => {
    const error = new Error('command could not start');
    expect(() => runPreflight({ error })).toThrow(error);
  });
});
