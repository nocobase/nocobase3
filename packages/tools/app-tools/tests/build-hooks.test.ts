// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

interface Hook {
  label: string;
  command: string[];
}
type HookStages = Record<string, Hook[]>;
type StepRunner = (label: string, command: string, args: string[]) => void;
interface CliHooksModule {
  readCliHooks: (rootDir: string) => { build: HookStages; dev: HookStages };
  runHookStage: (hooks: HookStages, stage: string, run: StepRunner) => void;
}

const cliHooksSource = readFileSync(
  new URL('../src/scripts/utils/cli-hooks.mjs', import.meta.url),
  'utf8',
);

/** Evaluates the hook reader with a replacement for `cross-spawn`, so no CLI has to exist. */
function loadCliHooks(
  sync: (...args: unknown[]) => {
    status?: number | null;
    stdout?: string;
    stderr?: string;
    error?: Error;
  },
): CliHooksModule {
  const script = `${cliHooksSource
    .replace(/^import spawn from 'cross-spawn';$/mu, '')
    .replaceAll('export const', 'const')}\n({ readCliHooks, runHookStage });`;
  return runInNewContext(script, {
    spawn: { sync },
    console: { error: vi.fn() },
  }) as CliHooksModule;
}

describe('plugin CLI hook reading', () => {
  it('asks the application CLI once and fills in every stage', () => {
    const sync = vi.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        build: {
          afterServerBuild: [
            { label: 'Compile workflows', command: ['pnpm', 'wf', 'build'] },
          ],
        },
      }),
    }));
    const hooks = loadCliHooks(sync).readCliHooks('/app');

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(
      'pnpm',
      ['nocobase', 'plugin', 'cli-hooks', '--json'],
      { cwd: '/app', encoding: 'utf8' },
    );
    expect(hooks).toEqual({
      build: {
        beforeBuild: [],
        afterClientBuild: [],
        afterServerBuild: [
          { label: 'Compile workflows', command: ['pnpm', 'wf', 'build'] },
        ],
        afterBuild: [],
      },
      dev: { beforeDev: [] },
    });
  });

  it('fails rather than skipping hooks when the CLI cannot be assembled', () => {
    const { readCliHooks } = loadCliHooks(() => ({
      status: 1,
      stdout: '',
      stderr: 'Cannot find module ./plugins.ts',
    }));
    expect(() => readCliHooks('/app')).toThrow(
      'Could not read plugin CLI hooks: `pnpm nocobase plugin cli-hooks` exited with 1.',
    );
  });

  it('fails when the CLI prints something other than JSON', () => {
    const { readCliHooks } = loadCliHooks(() => ({
      status: 0,
      stdout: 'Debugger attached.\n',
    }));
    expect(() => readCliHooks('/app')).toThrow(
      'Could not read plugin CLI hooks: the CLI did not print JSON.',
    );
  });

  it('propagates a launch error', () => {
    const error = new Error('spawn pnpm ENOENT');
    const { readCliHooks } = loadCliHooks(() => ({ error }));
    expect(() => readCliHooks('/app')).toThrow(error);
  });

  it('runs one stage in declaration order through the caller step runner', () => {
    const { runHookStage } = loadCliHooks(() => ({ status: 0, stdout: '{}' }));
    const run = vi.fn<StepRunner>();
    const hooks: HookStages = {
      afterBuild: [
        { label: 'First', command: ['pnpm', 'one', '--flag'] },
        { label: 'Second', command: ['node', 'two.mjs'] },
      ],
    };

    runHookStage(hooks, 'afterBuild', run);
    runHookStage(hooks, 'beforeBuild', run);

    expect(run.mock.calls).toEqual([
      ['First', 'pnpm', ['one', '--flag']],
      ['Second', 'node', ['two.mjs']],
    ]);
  });
});

/**
 * The real build pipeline, with `pnpm` and `node` replaced on PATH by shims that record what was asked of them.
 *
 * The build itself is spawned by absolute path, so only the steps it delegates go through the shims. That makes the
 * whole step sequence observable — including where each hook stage sits relative to the steps around it — without
 * compiling anything.
 */
describe('build pipeline hook stages', () => {
  const buildScript = path.resolve(
    import.meta.dirname,
    '../src/scripts/build.mjs',
  );
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  const hookStages = {
    build: {
      beforeBuild: [
        { label: 'Before build hook', command: ['pnpm', 'demo', 'before'] },
      ],
      afterClientBuild: [
        {
          label: 'After client hook',
          command: ['pnpm', 'demo', 'after-client'],
        },
      ],
      afterServerBuild: [
        {
          label: 'After server hook',
          command: ['node', 'after-server.mjs'],
        },
      ],
      afterBuild: [
        { label: 'After build hook', command: ['pnpm', 'demo', 'after-build'] },
      ],
    },
  };

  function runBuild(
    args: string[],
    options: {
      hooksStatus?: number;
      failOn?: string;
      failStatus?: number;
    } = {},
  ) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'nocobase-build-hooks-'));
    temporaryDirectories.push(root);
    const shimDir = path.join(root, 'shims');
    const log = path.join(root, 'commands.log');
    mkdirSync(shimDir, { recursive: true });
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'fixture-app' }),
    );
    mkdirSync(path.join(root, 'dist'), { recursive: true });
    const sentinel = path.join(root, 'dist', 'stale.txt');
    writeFileSync(sentinel, 'previous build');
    writeFileSync(path.join(root, 'hooks.json'), JSON.stringify(hookStages));

    const pnpmShim = [
      '#!/bin/sh',
      // A real `pnpm exec tsc` is what first recreates dist after the build clears it; the install step then runs
      // inside it, so a shim that never creates it fails that step on a missing working directory.
      'mkdir -p "$NOCOBASE_TOOL_ROOT/dist"',
      'printf "pnpm %s\\n" "$*" >> "$HOOK_LOG"',
      'if [ "$*" = "nocobase plugin cli-hooks --json" ]; then',
      '  cat "$HOOK_JSON"',
      '  exit "${HOOK_JSON_STATUS:-0}"',
      'fi',
      'if [ -n "$FAIL_ON" ] && [ "$*" = "$FAIL_ON" ]; then exit "${FAIL_STATUS:-1}"; fi',
      'exit 0',
      '',
    ].join('\n');
    // Steps hand `node` an absolute path into this package; only the script name is recorded.
    const nodeShim = [
      '#!/bin/sh',
      'printf "node %s" "$(basename "$1")" >> "$HOOK_LOG"',
      'shift',
      'if [ $# -gt 0 ]; then printf " %s" "$*" >> "$HOOK_LOG"; fi',
      'printf "\\n" >> "$HOOK_LOG"',
      'exit 0',
      '',
    ].join('\n');
    for (const [name, content] of [
      ['pnpm', pnpmShim],
      ['node', nodeShim],
    ] as const) {
      const shimPath = path.join(shimDir, name);
      writeFileSync(shimPath, content);
      chmodSync(shimPath, 0o755);
    }

    const result = spawnSync(process.execPath, [buildScript, ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
        NOCOBASE_TOOL_ROOT: root,
        NOCOBASE_SKIP_WORKSPACE_DEPENDENCY_BUILD: '0',
        HOOK_LOG: log,
        HOOK_JSON: path.join(root, 'hooks.json'),
        HOOK_JSON_STATUS: String(options.hooksStatus ?? 0),
        FAIL_ON: options.failOn ?? '',
        FAIL_STATUS: String(options.failStatus ?? 1),
      },
    });
    const commands = existsSync(log)
      ? readFileSync(log, 'utf8').trimEnd().split('\n')
      : [];
    return { result, commands, sentinel };
  }

  it.skipIf(process.platform === 'win32')(
    'runs each hook stage at its place in the pipeline and packs last with --tar',
    () => {
      const { result, commands, sentinel } = runBuild(['--tar']);

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(commands).toEqual([
        'pnpm nocobase plugin cli-hooks --json',
        'pnpm demo before',
        'pnpm exec tsc',
        'pnpm exec tsc -p tsconfig.node.json',
        'pnpm exec refine build',
        'pnpm demo after-client',
        'pnpm --filter fixture-app^... build',
        'pnpm exec tsc -p tsconfig.server.json',
        'pnpm exec tsc-alias -p tsconfig.server.json',
        'node after-server.mjs',
        'node build-server-dist-package.mjs',
        'pnpm install --prod --no-lockfile',
        'node clean-dist-bin.mjs',
        'node retarget-native.mjs --tar',
        'node prune-dist-artifacts.mjs',
        'node verify-server-deps.mjs',
        'pnpm demo after-build',
        'node pack-dist.mjs',
      ]);
      for (const label of [
        'Before build hook',
        'After client hook',
        'After server hook',
        'After build hook',
        'Pack deployment archive',
      ]) {
        expect(result.stdout).toContain(`\n> ${label}`);
      }
      expect(result.stdout).toContain('Build complete');
      // Cleared after the hooks were read and before the first hook ran, so a hook may write into it.
      expect(existsSync(sentinel)).toBe(false);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'skips the archive without --tar and forwards target flags to the retarget step',
    () => {
      const { result, commands } = runBuild([
        '--target',
        'linux-x64',
        '--node-version',
        '24',
      ]);

      expect(result.status).toBe(0);
      expect(commands).toContain(
        'node retarget-native.mjs --target linux-x64 --node-version 24',
      );
      expect(commands.at(-1)).toBe('pnpm demo after-build');
      expect(commands).not.toContain('node pack-dist.mjs');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'stops before clearing dist when the hooks cannot be read',
    () => {
      const { result, commands, sentinel } = runBuild([], { hooksStatus: 2 });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'Could not read plugin CLI hooks: `pnpm nocobase plugin cli-hooks` exited with 2.',
      );
      expect(commands).toEqual(['pnpm nocobase plugin cli-hooks --json']);
      expect(readFileSync(sentinel, 'utf8')).toBe('previous build');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'exits with a failed hook status and runs nothing after it',
    () => {
      const { result, commands } = runBuild([], {
        failOn: 'demo after-client',
        failStatus: 4,
      });

      expect(result.status).toBe(4);
      expect(commands.at(-1)).toBe('pnpm demo after-client');
      expect(commands).not.toContain('pnpm exec tsc -p tsconfig.server.json');
    },
  );
});
