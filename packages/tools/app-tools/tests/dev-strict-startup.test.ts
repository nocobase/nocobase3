// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('../src/scripts/dev/index.mjs', import.meta.url),
  'utf8',
);

it.each([true, false])(
  'strict=%s controls the server watcher and preserves failure status',
  (strictStartup) => {
    const spawnDevProcess = vi.fn(() => ({ stdin: {} }));
    const watchConfigFiles = vi.fn();
    // Test process supervision independently of application environment assembly.
    runInNewContext(
      source.slice(
        source.indexOf('  const serverChild = spawnDevProcess('),
        source.indexOf('\n}\n\ntry {\n  progress('),
      ),
      {
        strictStartup,
        path,
        serverEnv: {},
        spawnDevProcess,
        pluginWatchIncludes: ['plugin/server/**'],
        rootDir: '/app',
        process: { stdin: { pipe: vi.fn() } },
        resolveConfigWatch: () => ({}),
        watchConfigFiles,
      },
    );
    const args = spawnDevProcess.mock.calls[0][2] as string[];
    expect(args.includes('watch')).toBe(!strictStartup);
    expect(args.includes('--include')).toBe(!strictStartup);
    expect(args).toContain('server/standalone.ts');
    expect(watchConfigFiles).toHaveBeenCalledTimes(strictStartup ? 0 : 1);
  },
);

it('preserves startup failure and delegates descendant cleanup to the supervisor', () => {
  const processMock = { exitCode: 0, exit: vi.fn() };
  const close = vi.fn();
  runInNewContext(
    source.slice(
      source.indexOf('const shutdown ='),
      source.indexOf("process.on('SIGINT'"),
    ) + '\nshutdown(1);',
    {
      shuttingDown: false,
      envRestartTimer: undefined,
      envWatcher: { close },
      process: processMock,
    },
  );
  expect(processMock.exitCode).toBe(1);
  expect(close).toHaveBeenCalledOnce();
  expect(processMock.exit).toHaveBeenCalledWith(1);
});
