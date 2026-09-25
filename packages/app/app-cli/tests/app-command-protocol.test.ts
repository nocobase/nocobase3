// @vitest-environment node
// The contract every AppCommand shares: what `--json` prints, how failures surface, where path flags point, and that
// `withApp()` always puts the application away.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Application } from '@nocobase/app-server';
import { Flags } from '@oclif/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppCommand, CommandError, appPath } from '../src/index.ts';
import { bindAppCommand } from '../src/testing.ts';
import type { AppCommandRuntime } from '../src/context.ts';
import { runAppCommand } from './command-output.ts';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'app-command-protocol-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', nocobase: { templateKind: 'default' } }),
  );
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

class Returns extends AppCommand {
  static override id = 'fixture:returns';
  public async run(): Promise<{ applied: number }> {
    await this.parse(Returns);
    this.log('Applied 3 migrations.');
    return { applied: 3 };
  }
}

class ReturnsNothing extends AppCommand {
  static override id = 'fixture:nothing';
  public async run(): Promise<void> {
    await this.parse(ReturnsNothing);
  }
}

class Fails extends AppCommand {
  static override id = 'fixture:fails';
  public async run(): Promise<never> {
    await this.parse(Fails);
    this.warn('Something to know first.');
    throw new CommandError('Could not connect to the database main', {
      code: 'CONNECTION_FAILED',
      suggestions: [
        {
          message: 'Check the configuration:',
          run: { command: 'pnpm', args: ['nocobase', 'config', 'check'] },
        },
      ],
      details: { connection: 'main' },
    });
  }
}

describe('--json', () => {
  it('prints one success document with the returned result, and nothing for people', async () => {
    const run = await runAppCommand(
      bindAppCommand(Returns, { rootDir: root }),
      ['--json'],
      root,
    );
    expect(run.json()).toEqual({
      schemaVersion: 1,
      ok: true,
      command: 'fixture returns',
      status: 'success',
      result: { applied: 3 },
      warnings: [],
    });
    expect(run.stdout).not.toContain('Applied 3 migrations.');
    expect(run.exitCode).toBeUndefined();
  });

  it('still answers with a document when run() returns nothing', async () => {
    const run = await runAppCommand(
      bindAppCommand(ReturnsNothing, { rootDir: root }),
      ['--json'],
      root,
    );
    expect(run.json()).toMatchObject({
      ok: true,
      status: 'success',
      result: null,
    });
  });

  it('turns a CommandError into the failure document, keeps warnings, and exits non-zero', async () => {
    const run = await runAppCommand(
      bindAppCommand(Fails, { rootDir: root }),
      ['--json'],
      root,
    );
    expect(run.json()).toEqual({
      schemaVersion: 1,
      ok: false,
      command: 'fixture fails',
      status: 'failure',
      error: {
        code: 'CONNECTION_FAILED',
        message: 'Could not connect to the database main',
        suggestions: [
          {
            message: 'Check the configuration:',
            run: { command: 'pnpm', args: ['nocobase', 'config', 'check'] },
          },
        ],
        details: { connection: 'main' },
      },
      warnings: ['Something to know first.'],
    });
    expect(run.exitCode).toBe(1);
    expect(run.error).toBeUndefined();
  });

  it('reports an invalid flag as invalid usage with exit code 2', async () => {
    const run = await runAppCommand(
      bindAppCommand(Returns, { rootDir: root }),
      ['--json', '--nope'],
      root,
    );
    expect(run.json()).toMatchObject({ ok: false, status: 'failure' });
    expect(run.exitCode).toBe(2);
  });
});

describe('without --json', () => {
  it('prints what the command logs', async () => {
    const run = await runAppCommand(
      bindAppCommand(Returns, { rootDir: root }),
      [],
      root,
    );
    expect(run.stdout).toBe('Applied 3 migrations.\n');
    expect(run.result).toEqual({ applied: 3 });
  });

  it('rethrows a CommandError for oclif to print, with its exit code and suggestions', async () => {
    const run = await runAppCommand(
      bindAppCommand(Fails, { rootDir: root }),
      [],
      root,
    );
    expect(run.error).toBeInstanceOf(CommandError);
    expect(run.error).toMatchObject({
      oclif: { exit: 1 },
      suggestions: ['Check the configuration: pnpm nocobase config check'],
    });
    expect(run.stdout).toBe('');
  });
});

describe('what a command may not do', () => {
  it('refuses exit(), which would print an EEXIT error document', async () => {
    class Exits extends AppCommand {
      static override id = 'fixture:exits';
      public async run(): Promise<void> {
        await this.parse(Exits);
        this.exit(1);
      }
    }
    const run = await runAppCommand(
      bindAppCommand(Exits, { rootDir: root }),
      ['--json'],
      root,
    );
    expect(run.json()).toMatchObject({
      ok: false,
      error: {
        code: 'UNEXPECTED',
        message: expect.stringContaining('throw CommandError'),
      },
    });
  });

  it('refuses logJson(), which would print a second document', async () => {
    class LogsJson extends AppCommand {
      static override id = 'fixture:logs-json';
      public async run(): Promise<void> {
        await this.parse(LogsJson);
        this.logJson({ ok: true });
      }
    }
    const run = await runAppCommand(
      bindAppCommand(LogsJson, { rootDir: root }),
      ['--json'],
      root,
    );
    expect(run.json()).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining('Return the result from run()'),
      },
    });
  });

  it('sets a status other than success when asked', async () => {
    class NoOp extends AppCommand {
      static override id = 'fixture:noop';
      public async run(): Promise<{ changed: 0 }> {
        await this.parse(NoOp);
        this.setStatus('success-noop');
        return { changed: 0 };
      }
    }
    const run = await runAppCommand(
      bindAppCommand(NoOp, { rootDir: root }),
      ['--json'],
      root,
    );
    expect(run.json()).toMatchObject({ ok: true, status: 'success-noop' });
  });
});

describe('appPath()', () => {
  class Paths extends AppCommand {
    static override id = 'fixture:paths';
    static override flags = {
      source: appPath({ default: 'server/workflows', description: 'Sources.' }),
      output: appPath({ description: 'Output.' }),
    };
    public async run(): Promise<{
      source: string;
      output: string | undefined;
    }> {
      const { flags } = await this.parse(Paths);
      return { source: flags.source, output: flags.output };
    }
  }

  it('resolves the default against the application root, wherever the command runs', async () => {
    const elsewhere = await mkdtemp(path.join(os.tmpdir(), 'app-path-cwd-'));
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(elsewhere);
    try {
      const run = await runAppCommand(
        bindAppCommand(Paths, { rootDir: root }),
        [],
        root,
      );
      expect(run.result).toEqual({
        source: path.join(root, 'server/workflows'),
        output: undefined,
      });
    } finally {
      cwd.mockRestore();
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it('resolves a typed relative path from the current directory, and keeps an absolute one', async () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue('/work/crm/client');
    try {
      const run = await runAppCommand(
        bindAppCommand(Paths, { rootDir: root }),
        ['--source', '../tmp/wf', '--output', '/abs/out'],
        root,
      );
      expect(run.result).toEqual({
        source: '/work/crm/tmp/wf',
        output: '/abs/out',
      });
    } finally {
      cwd.mockRestore();
    }
  });

  it('describes the default as relative to the application root in --help', () => {
    expect(Paths.flags.source.defaultHelp).toBeTypeOf('function');
  });
});

describe('withApp()', () => {
  function stubContext(options: { createFails?: boolean } = {}) {
    const events: string[] = [];
    const app = {
      shutdown: vi.fn(async () => {
        events.push('app shutdown');
      }),
    } as unknown as Application;
    const runtime = {
      env: { FIXTURE: 'yes' },
      scope: {
        destroy: vi.fn(async () => {
          events.push('scope destroyed');
        }),
      },
    } as unknown as AppCommandRuntime;
    return {
      events,
      app,
      options: {
        rootDir: root,
        loadRuntime: async () => runtime,
        createApp: async (loaded: AppCommandRuntime) => {
          if (options.createFails) {
            (loaded as { app?: Application }).app = app;
            throw new Error('createApp failed');
          }
          return app;
        },
      },
    };
  }

  class UsesApp extends AppCommand {
    static override id = 'fixture:uses-app';
    static override flags = { fail: Flags.boolean({ default: false }) };
    public async run(): Promise<{ env: string | undefined }> {
      const { flags } = await this.parse(UsesApp);
      return this.withApp(async ({ env }) => {
        if (flags.fail)
          throw new CommandError('Callback failed', {
            code: 'CALLBACK_FAILED',
          });
        return { env: env.FIXTURE };
      });
    }
  }

  it('hands over the app and env, then shuts down and destroys the scope', async () => {
    const stub = stubContext();
    const run = await runAppCommand(
      bindAppCommand(UsesApp, stub.options),
      ['--json'],
      root,
    );
    expect(run.json()).toMatchObject({ ok: true, result: { env: 'yes' } });
    expect(stub.events).toEqual(['app shutdown', 'scope destroyed']);
  });

  it('still cleans up when the callback throws, and reports the callback failure', async () => {
    const stub = stubContext();
    const run = await runAppCommand(
      bindAppCommand(UsesApp, stub.options),
      ['--json', '--fail'],
      root,
    );
    expect(run.json()).toMatchObject({
      ok: false,
      error: { code: 'CALLBACK_FAILED' },
    });
    expect(stub.events).toEqual(['app shutdown', 'scope destroyed']);
  });

  it('shuts down the half-built app a failing createApp left on the runtime', async () => {
    const stub = stubContext({ createFails: true });
    const run = await runAppCommand(
      bindAppCommand(UsesApp, stub.options),
      ['--json'],
      root,
    );
    expect(run.json()).toMatchObject({
      ok: false,
      error: { message: 'createApp failed' },
    });
    expect(stub.events).toEqual(['app shutdown', 'scope destroyed']);
  });
});

describe('outside the runner', () => {
  it('tells a test to bind the command instead of failing obscurely', async () => {
    const run = await runAppCommand(Returns, ['--json'], root);
    // Returns never asks for rootDir, so it runs; one that does explains how to bind it.
    expect(run.json()).toMatchObject({ ok: true });
    class NeedsRoot extends AppCommand {
      static override id = 'fixture:needs-root';
      public async run(): Promise<string> {
        await this.parse(NeedsRoot);
        return this.rootDir;
      }
    }
    const unbound = await runAppCommand(NeedsRoot, ['--json'], root);
    expect(unbound.json()).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('bindAppCommand()') },
    });
  });
});

describe('suggestions for people', () => {
  it('quote an argument a shell would split, so the printed line can be pasted', () => {
    const error = new CommandError('The driver is missing', {
      code: 'DRIVER_MISSING',
      suggestions: [
        {
          message: 'Install the driver:',
          run: {
            command: 'pnpm',
            args: ['add', '@nocobase/db-mysql@>=1.0.0 <2.0.0'],
          },
        },
      ],
    });
    expect(error.suggestions).toEqual([
      "Install the driver: pnpm add '@nocobase/db-mysql@>=1.0.0 <2.0.0'",
    ]);
  });
});
