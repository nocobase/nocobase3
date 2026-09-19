// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('../../scripts/dev/index.mjs', import.meta.url),
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
        source.indexOf('\n}\n\ntry {\n  await Promise.all'),
      ),
      {
        strictStartup,
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

it('keeps exit status 1 when child termination lets the parent exit naturally', () => {
  const processMock = { exitCode: 0, exit: vi.fn() };
  const child = {
    killed: false,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
  };
  const close = vi.fn();
  const timeout = vi.fn(() => ({ unref: vi.fn() }));
  runInNewContext(
    source.slice(
      source.indexOf('const shutdown ='),
      source.indexOf("process.once('SIGINT'"),
    ) + '\nshutdown(1);',
    {
      shuttingDown: false,
      envRestartTimer: undefined,
      envWatcher: { close },
      children: [child],
      process: processMock,
      setTimeout: timeout,
    },
  );
  expect(processMock.exitCode).toBe(1);
  expect(close).toHaveBeenCalledOnce();
  expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  // child.killed only means a signal was sent, not that the process has exited.
  child.killed = true;
  (timeout.mock.calls[0] as unknown as [() => void])[0]();
  expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  expect(processMock.exit).toHaveBeenCalledWith(1);
});
